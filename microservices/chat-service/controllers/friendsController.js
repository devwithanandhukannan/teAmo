import { User } from '../models/User.js';
import { Friendship } from '../models/Friendship.js';
import { Like } from '../models/Like.js';
import { Message } from '../models/Message.js';
import { Notification } from '../models/Notification.js';
import { redisClient } from '../config/db.js';

// Follow or Like a matched opponent
export const followUser = async (req, res) => {
  const likerId = req.user._id;
  const likedId = req.params.id;

  if (likerId.toString() === likedId.toString()) {
    return res.status(400).json({ success: false, message: 'You cannot follow yourself.' });
  }

  try {
    const opponent = await User.findById(likedId);
    if (!opponent) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Increment follower/following counts
    await User.findByIdAndUpdate(likerId, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(likedId, { $inc: { followersCount: 1 } });

    // Check if Friendship already exists
    const existingFriendship = await Friendship.findOne({
      $or: [
        { user1: likerId, user2: likedId },
        { user1: likedId, user2: likerId }
      ]
    });

    if (existingFriendship) {
      return res.json({ success: true, isMatch: true, message: 'Already friends.' });
    }

    // Check if opponent already liked the current user (reciprocal)
    const opponentLike = await Like.findOne({ liker: likedId, liked: likerId });

    if (opponentLike) {
      // Reciprocal match! Create friendship.
      const friendship = new Friendship({
        user1: likerId,
        user2: likedId
      });
      await friendship.save();

      // Delete the temporary like
      await Like.findByIdAndDelete(opponentLike._id);

      // Create notifications for both
      await Notification.create({
        recipient: likedId,
        sender: likerId,
        type: 'friend_accept',
        message: `${req.user.username} liked you back! You are now friends.`
      });

      await Notification.create({
        recipient: likerId,
        sender: likedId,
        type: 'friend_accept',
        message: `You connected with ${opponent.username}! You are now friends.`
      });

      return res.json({ success: true, isMatch: true, message: 'It is a match! You are now friends.' });
    }

    // Single-sided follow: Store the like
    await Like.findOneAndUpdate(
      { liker: likerId, liked: likedId },
      { liker: likerId, liked: likedId },
      { upsert: true, new: true }
    );

    // Create follow notification
    await Notification.create({
      recipient: likedId,
      sender: likerId,
      type: 'friend_request',
      message: `${req.user.username} followed you.`
    });

    res.json({ success: true, isMatch: false, message: 'Followed user.' });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Fetch list of friends populated with online/offline status
export const getFriendsList = async (req, res) => {
  const userId = req.user._id;
  
  try {
    const friendships = await Friendship.find({
      $or: [{ user1: userId }, { user2: userId }]
    }).populate('user1 user2', 'username avatarUrl trustRank isAnonymous isOnline lastActive');

    const friendsList = friendships.map(f => {
      const isUser1Me = f.user1._id.toString() === userId.toString();
      const friendInfo = isUser1Me ? f.user2 : f.user1;
      return {
        friendshipId: f._id,
        _id: friendInfo._id,
        username: friendInfo.isAnonymous ? 'Anonymous Friend' : friendInfo.username,
        avatarUrl: friendInfo.avatarUrl,
        trustRank: friendInfo.trustRank,
        isOnline: friendInfo.isOnline,
        lastActive: friendInfo.lastActive
      };
    });

    res.json({ success: true, friends: friendsList });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Trust-like opponent to increase their trustRank
export const trustLikeUser = async (req, res) => {
  const targetId = req.params.id;
  
  try {
    const user = await User.findById(targetId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Limit trustRank to maximum of 200
    const newTrustRank = Math.min(user.trustRank + 5, 200);
    user.trustRank = newTrustRank;
    await user.save();

    res.json({ success: true, trustRank: newTrustRank, message: 'Opponent trust rank increased.' });
  } catch (error) {
    console.error('Trust-like error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Scan nearby online users using Redis Geo
export const scanNearbyUsers = async (req, res) => {
  const currentUserId = req.user._id.toString();
  const { longitude, latitude, radius } = req.body;

  if (longitude === undefined || latitude === undefined) {
    return res.status(400).json({ success: false, message: 'Coordinates are required.' });
  }

  try {
    const lng = parseFloat(longitude);
    const lat = parseFloat(latitude);
    const searchRadius = radius ? parseFloat(radius) : 50;

    // Save/update current user location in Redis Geo index
    await redisClient.geoAdd('online_users_loc', {
      longitude: lng,
      latitude: lat,
      member: currentUserId
    });

    // Search online users within searchRadius km
    const results = await redisClient.geoSearchWith(
      'online_users_loc',
      { longitude: lng, latitude: lat },
      { radius: searchRadius, unit: 'km' },
      ['WITHDIST']
    );

    // Fetch user IDs that are currently online (have active socket)
    const onlineUserSocketMap = await redisClient.hGetAll('online_sockets');
    const onlineUserIds = Object.keys(onlineUserSocketMap);

    // Map and filter results
    const nearbyUsers = [];
    
    for (const item of results) {
      const memberId = item.member;
      // Skip self
      if (memberId === currentUserId) continue;

      // Ensure user is currently online
      if (onlineUserIds.includes(memberId)) {
        const distance = parseFloat(item.distance).toFixed(1);
        const user = await User.findById(memberId).select('avatarUrl isAnonymous username');
        
        if (user && !user.isBanned) {
          nearbyUsers.push({
            userId: memberId,
            avatarUrl: user.avatarUrl,
            username: user.isAnonymous ? 'Anonymous' : user.username,
            distance: `${distance} km`
          });
        }
      }
    }

    res.json({
      success: true,
      count: nearbyUsers.length,
      nearbyUsers
    });
  } catch (error) {
    console.error('Nearby scan error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Fetch Direct Messages with a Friend (WhatsApp-like save)
export const getDirectMessages = async (req, res) => {
  const userId = req.user._id;
  const friendId = req.params.friendId;

  try {
    const messages = await Message.find({
      $or: [
        { sender: userId, recipient: friendId },
        { sender: friendId, recipient: userId }
      ]
    }).sort({ createdAt: 1 });

    res.json({ success: true, messages });
  } catch (error) {
    console.error('Get DM history error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
