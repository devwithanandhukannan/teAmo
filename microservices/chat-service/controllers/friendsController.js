import { User } from '../models/User.js';
import { Friendship } from '../models/Friendship.js';
import { Like } from '../models/Like.js';
import { Message } from '../models/Message.js';
import { redisClient } from '../config/db.js';
import { createAndSendNotification } from '../services/notificationService.js';

// Send a follow request
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

    // Check if we already sent a request or are already following
    const existingLike = await Like.findOne({ liker: likerId, liked: likedId });
    if (existingLike) {
      if (existingLike.status === 'accepted') {
        return res.json({ success: true, message: 'Already following.' });
      }
      return res.json({ success: true, message: 'Follow request already sent.' });
    }

    // Create a new pending follow request
    await Like.create({
      liker: likerId,
      liked: likedId,
      status: 'pending'
    });

    // Create follow request notification
    await createAndSendNotification({
      recipient: likedId,
      sender: likerId,
      type: 'follow_request',
      message: `${req.user.username} sent you a follow request.`
    });

    res.json({ success: true, isMatch: false, message: 'Follow request sent.' });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Accept a follow request
export const acceptFollow = async (req, res) => {
  const likedId = req.user._id;
  const likerId = req.params.id; // The person who sent the request

  try {
    const pendingLike = await Like.findOne({ liker: likerId, liked: likedId, status: 'pending' });
    if (!pendingLike) {
      return res.status(404).json({ success: false, message: 'Follow request not found or already processed.' });
    }

    // Mark as accepted
    pendingLike.status = 'accepted';
    await pendingLike.save();

    // Increment counts
    await User.findByIdAndUpdate(likerId, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(likedId, { $inc: { followersCount: 1 } });

    const likerUser = await User.findById(likerId).select('username');

    // Notify the liker that their request was accepted
    await createAndSendNotification({
      recipient: likerId,
      sender: likedId,
      type: 'friend_accept', // We can reuse this type for general acceptances
      message: `${req.user.username} accepted your follow request.`
    });

    // Check if the other person is also following back (reciprocal accepted like)
    const reciprocalLike = await Like.findOne({ liker: likedId, liked: likerId, status: 'accepted' });
    if (reciprocalLike) {
      // Both are following each other! Create friendship.
      const existingFriendship = await Friendship.findOne({
        $or: [
          { user1: likerId, user2: likedId },
          { user1: likedId, user2: likerId }
        ]
      });

      if (!existingFriendship) {
        await Friendship.create({ user1: likerId, user2: likedId });
        
        // Notify both that they are now mutual friends
        await createAndSendNotification({
          recipient: likedId,
          sender: likerId,
          type: 'friend_accept',
          message: `You and ${likerUser.username} are now mutual friends!`
        });
        await createAndSendNotification({
          recipient: likerId,
          sender: likedId,
          type: 'friend_accept',
          message: `You and ${req.user.username} are now mutual friends!`
        });
      }
      return res.json({ success: true, isMatch: true, message: 'Follow request accepted. You are now mutual friends!' });
    }

    res.json({ success: true, isMatch: false, message: 'Follow request accepted.' });
  } catch (error) {
    console.error('Accept follow error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Reject a follow request
export const rejectFollow = async (req, res) => {
  const likedId = req.user._id;
  const likerId = req.params.id;

  try {
    const deleted = await Like.findOneAndDelete({ liker: likerId, liked: likedId, status: 'pending' });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Follow request not found or already processed.' });
    }
    res.json({ success: true, message: 'Follow request rejected.' });
  } catch (error) {
    console.error('Reject follow error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Get Relationship Status
export const getRelationshipStatus = async (req, res) => {
  const currentUserId = req.user._id;
  const targetId = req.params.id;

  try {
    const existingFriendship = await Friendship.findOne({
      $or: [
        { user1: currentUserId, user2: targetId },
        { user1: targetId, user2: currentUserId }
      ]
    });

    if (existingFriendship) {
      return res.json({ success: true, status: 'friends' });
    }

    const myLike = await Like.findOne({ liker: currentUserId, liked: targetId });
    if (myLike) {
      if (myLike.status === 'pending') {
        return res.json({ success: true, status: 'requested_by_me' });
      }
      if (myLike.status === 'accepted') {
        return res.json({ success: true, status: 'following' });
      }
    }

    res.json({ success: true, status: 'none' });
  } catch (error) {
    console.error('Get relationship status error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Remove a pending like / unfollow
export const unfollowUser = async (req, res) => {
  const likerId = req.user._id;
  const likedId = req.params.id;

  try {
    // If it was accepted, we need to decrement counts
    const like = await Like.findOneAndDelete({ liker: likerId, liked: likedId });
    if (like && like.status === 'accepted') {
      await User.findByIdAndUpdate(likerId, { $inc: { followingCount: -1 } });
      await User.findByIdAndUpdate(likedId, { $inc: { followersCount: -1 } });
    }

    res.json({ success: true, message: 'Unfollowed user.' });
  } catch (error) {
    console.error('Unfollow error:', error);
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

// Unfriend / Remove friendship
export const removeFriend = async (req, res) => {
  const userId = req.user._id;
  const friendId = req.params.id;

  try {
    // Find and delete the friendship
    const deletedFriendship = await Friendship.findOneAndDelete({
      $or: [
        { user1: userId, user2: friendId },
        { user1: friendId, user2: userId }
      ]
    });

    // Also delete any residual likes
    await Like.deleteMany({
      $or: [
        { liker: userId, liked: friendId },
        { liker: friendId, liked: userId }
      ]
    });

    if (deletedFriendship) {
      // Decrement following/followers counts for both users
      await User.findByIdAndUpdate(userId, { $inc: { followingCount: -1, followersCount: -1 } });
      await User.findByIdAndUpdate(friendId, { $inc: { followingCount: -1, followersCount: -1 } });
    }

    res.json({ success: true, message: 'Friend removed successfully.' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

