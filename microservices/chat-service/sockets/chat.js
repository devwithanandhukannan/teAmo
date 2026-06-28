import { User } from '../models/User.js';
import { Friendship } from '../models/Friendship.js';
import { Group } from '../models/Group.js';
import { Setting } from '../models/Setting.js';
import { Message } from '../models/Message.js';
import { createAndSendNotification } from '../services/notificationService.js';
import { redisClient } from '../config/db.js';
import { findMatchForUser, removeUserFromMatchingPool } from '../services/matchmaker.js';

const obfuscateUserIfNeeded = (user) => {
  if (!user) return null;
  if (user.username === 'admin') {
    return {
      _id: user._id,
      username: 'Stranger',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Stranger',
      trustRank: 100,
      isAnonymous: true,
      interests: []
    };
  }
  return {
    _id: user._id,
    username: user.isAnonymous ? 'Stranger' : user.username,
    avatarUrl: user.avatarUrl,
    trustRank: user.trustRank,
    isAnonymous: user.isAnonymous,
    interests: user.interests || []
  };
};

export const handleSocketConnections = (io) => {
  io.on('connection', async (socket) => {
    let currentUserId = null;
    console.log(`Socket connected: ${socket.id}`);

    // Join a login verification session room to listen for activation events
    socket.on('join_login_session', ({ authSessionId }) => {
      if (authSessionId) {
        socket.join(`login_session:${authSessionId}`);
        console.log(`Socket ${socket.id} joined login_session:${authSessionId}`);
      }
    });

    // User authentication/binding on connect
    socket.on('authenticate', async ({ token, userId }) => {
      if (!userId) return;
      
      try {
        const user = await User.findById(userId);
        if (!user || user.isBanned) {
          socket.emit('banned');
          socket.disconnect(true);
          return;
        }

        currentUserId = userId;
        socket.sessionStart = Date.now();
        console.log(`User ${userId} authenticated on socket ${socket.id}`);
        
        // If there was an old socket, clean it up and disconnect it
        const oldSocketId = await redisClient.hGet('online_sockets', userId);
        if (oldSocketId && oldSocketId !== socket.id) {
          await redisClient.hDel('socket_users', oldSocketId);
          const oldSocket = io.sockets.sockets.get(oldSocketId);
          if (oldSocket) {
            oldSocket.emit('force_disconnect', { reason: 'Another session opened' });
            oldSocket.disconnect(true);
          }
        }
        
        // Store socket mappings in Redis
        await redisClient.hSet('online_sockets', userId, socket.id);
        await redisClient.hSet('socket_users', socket.id, userId);
        
        // Mark online in DB
        await User.findByIdAndUpdate(userId, { isOnline: true, lastActive: new Date() });
        
        // Broadcast real-time online count to all clients using hLen
        const count = await redisClient.hLen('online_sockets');
        io.emit('online_metrics', { count });
        
        // Alert friends that this user came online
        await alertFriendsStatus(userId, true);

        // Check if this user has an active match in Redis to restore it
        const opponentId = await redisClient.hGet('active_matches', userId);
        if (opponentId) {
          const opponentSocketId = await redisClient.hGet('online_sockets', opponentId);
          if (opponentSocketId) {
            const opponent = await User.findById(opponentId);
            if (opponent) {
              socket.emit('match_found', {
                opponent: obfuscateUserIfNeeded(opponent),
                sharedInterests: [],
                isCaller: false
              });
            }
          }
        }
      } catch (err) {
        console.error('Socket auth error:', err);
        socket.disconnect(true);
      }
    });

    // Match search request
    socket.on('search_match', async () => {
      if (!currentUserId) return;
      
      try {
        const user = await User.findById(currentUserId);
        if (!user || user.isBanned) {
          socket.emit('banned');
          socket.disconnect(true);
          return;
        }

        const onlineCount = await redisClient.hLen('online_sockets');
        
        const thresholdSetting = await Setting.findOne({ key: 'live_threshold' });
        const threshold = thresholdSetting ? parseInt(thresholdSetting.value || '1000', 10) : 1000;

        if (onlineCount >= threshold) {
          console.log(`Threshold exceeded (${onlineCount}/${threshold}). Routing ${currentUserId} to group.`);
          await routeToTempGroup(socket, currentUserId);
          return;
        }

        const matchResult = await findMatchForUser(currentUserId, user.interests);
        
        if (matchResult) {
          const { candidateId, sharedInterests } = matchResult;
          const candidateSocketId = await redisClient.hGet('online_sockets', candidateId);
          
          if (candidateSocketId) {
            await redisClient.hSet('active_matches', currentUserId, candidateId);
            await redisClient.hSet('active_matches', candidateId, currentUserId);
            
            const matchUser = await User.findById(candidateId);
            const selfUser = await User.findById(currentUserId);

            io.to(socket.id).emit('match_found', {
              opponent: obfuscateUserIfNeeded(matchUser),
              sharedInterests,
              isCaller: true
            });
            io.to(candidateSocketId).emit('match_found', {
              opponent: obfuscateUserIfNeeded(selfUser),
              sharedInterests,
              isCaller: false
            });
          } else {
            await findMatchForUser(currentUserId, user.interests);
          }
        } else {
          socket.emit('waiting');
        }
      } catch (err) {
        console.error('Matching socket error:', err);
        socket.emit('error_message', { message: 'Matchmaking failed.' });
      }
    });

    // Skip / disconnect active match
    socket.on('skip_match', async () => {
      if (!currentUserId) return;
      await handleSkip(currentUserId);
    });

    // WebRTC signaling forwards for matches & direct calls
    socket.on('signal', async ({ signalData }) => {
      if (!currentUserId) return;
      
      // 1. Check active matchmaking match
      let opponentId = await redisClient.hGet('active_matches', currentUserId);
      
      // 2. Fallback: Check active direct call between friends
      if (!opponentId) {
        opponentId = await redisClient.hGet('active_calls', currentUserId);
      }
      
      if (opponentId) {
        const opponentSocketId = await redisClient.hGet('online_sockets', opponentId);
        if (opponentSocketId) {
          io.to(opponentSocketId).emit('signal', { signalData });
        }
      }
    });

    // Real-time match liking notifications
    socket.on('match_like', async ({ toUserId, type }) => {
      if (!currentUserId || !toUserId) return;
      const opponentSocketId = await redisClient.hGet('online_sockets', toUserId);
      if (opponentSocketId) {
        io.to(opponentSocketId).emit('match_liked', { fromUserId: currentUserId, type });
      }
    });

    // Direct text messaging inside active match
    socket.on('match_message', async ({ text }) => {
      if (!currentUserId) return;
      
      const opponentId = await redisClient.hGet('active_matches', currentUserId);
      if (opponentId) {
        // Save chat in database if neither user is anonymous
        const sender = await User.findById(currentUserId);
        const recipient = await User.findById(opponentId);
        if (sender && recipient && !sender.isAnonymous && !recipient.isAnonymous) {
          await Message.create({
            sender: currentUserId,
            recipient: opponentId,
            text
          });
        }

        // Save chat history in Redis matching log (valid for 2 hours)
        const sortedIds = [currentUserId.toString(), opponentId.toString()].sort();
        const sessionKey = `match_chat:${sortedIds[0]}_${sortedIds[1]}`;
        const messagePayload = {
          senderId: currentUserId,
          senderUsername: sender?.isAnonymous ? 'Stranger' : sender?.username || 'Stranger',
          text,
          createdAt: new Date()
        };
        await redisClient.rPush(sessionKey, JSON.stringify(messagePayload));
        await redisClient.expire(sessionKey, 7200);

        const opponentSocketId = await redisClient.hGet('online_sockets', opponentId);
        if (opponentSocketId) {
          io.to(opponentSocketId).emit('match_message', { senderId: currentUserId, text });
        }
      }
    });

    // Direct private messaging (for permanent friends)
    socket.on('direct_message', async ({ toUserId, text }) => {
      if (!currentUserId) return;
      
      // Save message history always for permanent friends
      await Message.create({
        sender: currentUserId,
        recipient: toUserId,
        text
      });

      const recipientSocketId = await redisClient.hGet('online_sockets', toUserId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('direct_message', {
          senderId: currentUserId,
          text,
          createdAt: new Date()
        });
      }
    });

    // Direct Call signaling (between friends)
    socket.on('call_user', async ({ toUserId, offer }) => {
      if (!currentUserId) return;
      
      // Pair call in Redis so early signals/candidates can be routed
      await redisClient.hSet('active_calls', currentUserId, toUserId);
      await redisClient.hSet('active_calls', toUserId, currentUserId);
      
      const recipientSocketId = await redisClient.hGet('online_sockets', toUserId);
      if (recipientSocketId) {
        const callerInfo = await User.findById(currentUserId).select('username avatarUrl');
        io.to(recipientSocketId).emit('call_incoming', {
          fromUserId: currentUserId,
          caller: callerInfo,
          offer
        });
      }
    });

    socket.on('accept_call', async ({ toUserId, answer }) => {
      if (!currentUserId) return;
      
      const callerSocketId = await redisClient.hGet('online_sockets', toUserId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call_accepted', { answer });
      }
    });

    socket.on('reject_call', async ({ toUserId }) => {
      if (!currentUserId) return;
      
      // Clean call in Redis since call was declined
      await redisClient.hDel('active_calls', currentUserId);
      await redisClient.hDel('active_calls', toUserId);
      
      const callerSocketId = await redisClient.hGet('online_sockets', toUserId);
      if (callerSocketId) {
        io.to(callerSocketId).emit('call_rejected');
      }
    });

    socket.on('end_call', async ({ toUserId }) => {
      if (!currentUserId) return;
      
      // Clean call in Redis
      await redisClient.hDel('active_calls', currentUserId);
      await redisClient.hDel('active_calls', toUserId);
      
      const opponentSocketId = await redisClient.hGet('online_sockets', toUserId);
      if (opponentSocketId) {
        io.to(opponentSocketId).emit('call_ended');
      }
    });

    // Temp Group chat socket events
    socket.on('group_message', async ({ groupId, text }) => {
      if (!currentUserId) return;
      const user = await User.findById(currentUserId).select('username');
      if (user) {
        io.to(`group_${groupId}`).emit('group_message', {
          senderId: currentUserId,
          username: user.username,
          text,
          createdAt: new Date()
        });
      }
    });

    // Nearby Connection Requests
    socket.on('nearby_request', async ({ toUserId }) => {
      if (!currentUserId || !toUserId) return;
      try {
        await redisClient.setEx(`nearby_req:${currentUserId}:${toUserId}`, 300, 'pending');
        const sender = await User.findById(currentUserId).select('username avatarUrl isAnonymous');
        if (!sender) return;

        const opponentSocketId = await redisClient.hGet('online_sockets', toUserId);
        if (opponentSocketId) {
          io.to(opponentSocketId).emit('nearby_request_received', {
            fromUser: {
              _id: currentUserId,
              username: sender.isAnonymous ? 'Anonymous' : sender.username,
              avatarUrl: sender.avatarUrl
            }
          });
        }
      } catch (err) {
        console.error('nearby_request socket error:', err);
      }
    });

    socket.on('nearby_request_cancel', async ({ toUserId }) => {
      if (!currentUserId || !toUserId) return;
      try {
        await redisClient.del(`nearby_req:${currentUserId}:${toUserId}`);
        const opponentSocketId = await redisClient.hGet('online_sockets', toUserId);
        if (opponentSocketId) {
          io.to(opponentSocketId).emit('nearby_request_cancelled', {
            fromUserId: currentUserId
          });
        }
      } catch (err) {
        console.error('nearby_request_cancel socket error:', err);
      }
    });

    socket.on('nearby_response', async ({ fromUserId, accepted }) => {
      if (!currentUserId || !fromUserId) return;
      try {
        const reqKey = `nearby_req:${fromUserId}:${currentUserId}`;
        const pending = await redisClient.get(reqKey);
        if (!pending) return;

        await redisClient.del(reqKey);
        const senderSocketId = await redisClient.hGet('online_sockets', fromUserId);

        if (accepted) {
          const existing = await Friendship.findOne({
            $or: [
              { user1: fromUserId, user2: currentUserId },
              { user1: currentUserId, user2: fromUserId }
            ]
          });

          if (!existing) {
            const friendship = new Friendship({
              user1: fromUserId,
              user2: currentUserId
            });
            await friendship.save();

            await User.findByIdAndUpdate(fromUserId, { $inc: { followingCount: 1, followersCount: 1 } });
            await User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: 1, followersCount: 1 } });

            const fromUser = await User.findById(fromUserId).select('username');
            const currentUser = await User.findById(currentUserId).select('username');

            if (fromUser && currentUser) {
              await createAndSendNotification({
                recipient: currentUserId,
                sender: fromUserId,
                type: 'friend_accept',
                message: `${fromUser.username} connected with you! You are now friends.`
              });

              await createAndSendNotification({
                recipient: fromUserId,
                sender: currentUserId,
                type: 'friend_accept',
                message: `${currentUser.username} accepted your connection request! You are now friends.`
              });
            }
          }

          if (senderSocketId) {
            io.to(senderSocketId).emit('nearby_request_accepted', {
              toUserId: currentUserId
            });
          }
        } else {
          if (senderSocketId) {
            io.to(senderSocketId).emit('nearby_request_denied', {
              toUserId: currentUserId
            });
          }
        }
      } catch (err) {
        console.error('nearby_response socket error:', err);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`Socket disconnected: ${socket.id}`);
      
      if (currentUserId) {
        // Track stay duration session length
        if (socket.sessionStart) {
          const sessionDurationSeconds = Math.round((Date.now() - socket.sessionStart) / 1000);
          if (sessionDurationSeconds > 0) {
            try {
              await User.findByIdAndUpdate(currentUserId, { 
                $inc: { totalOnlineTime: sessionDurationSeconds } 
              });
            } catch (dbErr) {
              console.error('Error updating totalOnlineTime:', dbErr);
            }
          }
        }

        // Only mark offline if this socket is the active one in online_sockets
        const activeSocketId = await redisClient.hGet('online_sockets', currentUserId);
        if (activeSocketId === socket.id) {
          await handleSkip(currentUserId);
          await removeUserFromMatchingPool(currentUserId);
          
          // Clean up any active call
          const activeCallPeerId = await redisClient.hGet('active_calls', currentUserId);
          if (activeCallPeerId) {
            await redisClient.hDel('active_calls', currentUserId);
            await redisClient.hDel('active_calls', activeCallPeerId);
            const peerSocketId = await redisClient.hGet('online_sockets', activeCallPeerId);
            if (peerSocketId) {
              io.to(peerSocketId).emit('call_ended');
            }
          }
          
          await redisClient.hDel('online_sockets', currentUserId);
          await User.findByIdAndUpdate(currentUserId, { isOnline: false, lastActive: new Date() });
          
          await alertFriendsStatus(currentUserId, false);
        }
        
        await redisClient.hDel('socket_users', socket.id);
        
        // Broadcast updated count to all clients using hLen
        const count = await redisClient.hLen('online_sockets');
        io.emit('online_metrics', { count });
      }
    });
  });
};

const handleSkip = async (userId) => {
  const opponentId = await redisClient.hGet('active_matches', userId);
  await redisClient.hDel('active_matches', userId);
  
  if (opponentId) {
    await redisClient.hDel('active_matches', opponentId);
    
    // Store previous opponent mapping in Redis for 5 minutes (300 seconds)
    await redisClient.setEx(`previous_opponent:${userId}`, 300, opponentId);
    await redisClient.setEx(`previous_opponent:${opponentId}`, 300, userId);
    
    const opponentSocketId = await redisClient.hGet('online_sockets', opponentId);
    if (opponentSocketId) {
      global.io.to(opponentSocketId).emit('match_skipped');
    }
  }
  
  await removeUserFromMatchingPool(userId);
};

const alertFriendsStatus = async (userId, isOnline) => {
  try {
    const friendships = await Friendship.find({
      $or: [{ user1: userId }, { user2: userId }]
    });

    const friendIds = friendships.map(f => 
      f.user1.toString() === userId.toString() ? f.user2.toString() : f.user1.toString()
    );

    for (const friendId of friendIds) {
      const friendSocketId = await redisClient.hGet('online_sockets', friendId);
      if (friendSocketId) {
        global.io.to(friendSocketId).emit(isOnline ? 'friend_online' : 'friend_offline', { userId });
      }
    }
  } catch (error) {
    console.error('Error alerting friends status:', error);
  }
};

const routeToTempGroup = async (socket, userId) => {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    let group = await Group.findOne({
      createdAt: { $gte: twoHoursAgo },
      isBanned: false,
      'members.5': { $exists: false }
    });

    if (!group) {
      const count = await Group.countDocuments();
      group = new Group({
        name: `Lounge Chat #${count + 1}`,
        members: [userId],
        createdBy: userId
      });
      await group.save();
    } else {
      if (!group.members.includes(userId)) {
        group.members.push(userId);
        await group.save();
      }
    }

    socket.join(`group_${group._id}`);
    const membersInfo = await User.find({ _id: { $in: group.members } }).select('username avatarUrl');
    
    socket.emit('joined_group', {
      group: {
        _id: group._id,
        name: group.name,
        members: membersInfo
      }
    });

    const joinedUser = await User.findById(userId).select('username avatarUrl');
    socket.to(`group_${group._id}`).emit('group_user_joined', { user: joinedUser });

  } catch (error) {
    console.error('Routing to temp group failed:', error);
    socket.emit('error_message', { message: 'Failed to join lounge group.' });
  }
};
