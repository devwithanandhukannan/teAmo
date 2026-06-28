import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Snap } from '../models/Snap.js';
import { Friendship } from '../models/Friendship.js';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { redisClient } from '../config/db.js';
import { createAndSendNotification } from '../services/notificationService.js';

// Multer Local Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './public/uploads';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user._id}-${Date.now()}${ext}`);
  }
});

// Configure upload middleware
export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB Max
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Images only are supported!'));
    }
  }
});

// Post a new snap (expires in 24 hours automatically)
export const createSnap = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an image.' });
    }

    // Build URL endpoint path
    const imageUrl = `/uploads/${req.file.filename}`;
    
    const snap = new Snap({
      sender: req.user._id,
      imageUrl
    });
    
    await snap.save();

    // Alert all active friends
    const friendships = await Friendship.find({
      $or: [{ user1: req.user._id }, { user2: req.user._id }]
    });

    const friendIds = friendships.map(f => 
      f.user1.toString() === req.user._id.toString() ? f.user2 : f.user1
    );

    for (const friendId of friendIds) {
      await createAndSendNotification({
        recipient: friendId,
        sender: req.user._id,
        type: 'new_snap',
        message: `${req.user.username} shared a new snap.`
      });
    }

    res.status(201).json({ success: true, snap });
  } catch (error) {
    console.error('Create snap error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Retrieve current feed of snaps from friends
export const getSnapsFeed = async (req, res) => {
  const userId = req.user._id;

  try {
    // Find all friends
    const friendships = await Friendship.find({
      $or: [{ user1: userId }, { user2: userId }]
    });

    const friendIds = friendships.map(f => 
      f.user1.toString() === userId.toString() ? f.user2 : f.user1
    );

    // Retrieve active snaps from self and friends
    const feedIds = [...friendIds, userId];

    const snaps = await Snap.find({ sender: { $in: feedIds } })
      .populate('sender', 'username avatarUrl')
      .sort({ createdAt: -1 });

    res.json({ success: true, snaps });
  } catch (error) {
    console.error('Get snaps feed error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Delete own snap manually before 24h expiration
export const deleteSnap = async (req, res) => {
  try {
    const snapId = req.params.id;
    const snap = await Snap.findById(snapId);
    
    if (!snap) {
      return res.status(404).json({ success: false, message: 'Snap not found' });
    }

    if (snap.sender.toString() !== req.user._id.toString()) {
      return res.status(401).json({ success: false, message: 'Unauthorized to delete this snap.' });
    }

    // Delete image file locally
    const filename = snap.imageUrl.split('/').pop();
    const filePath = path.join('./public/uploads', filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await Snap.findByIdAndDelete(snapId);
    res.json({ success: true, message: 'Snap deleted successfully.' });
  } catch (error) {
    console.error('Delete snap error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createReport = async (req, res) => {
  let { targetId, reason } = req.body;
  const reporterId = req.user._id;

  try {
    // 1. Resolve targetId from previous opponent if empty or missing
    if (!targetId || targetId === 'null' || targetId === 'undefined' || targetId === '') {
      const lastOpponent = await redisClient.get(`previous_opponent:${reporterId}`);
      if (lastOpponent) {
        targetId = lastOpponent;
      }
    }

    if (!targetId) {
      return res.status(400).json({ success: false, message: 'No active or previous opponent found to report.' });
    }

    const reportedUser = await User.findById(targetId);
    const reporterUser = await User.findById(reporterId);

    const reporterIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const reportedUserIp = reportedUser?.lastIp || '';

    // 2. Fetch chat history from Redis
    const sortedIds = [reporterId.toString(), targetId.toString()].sort();
    const sessionKey = `match_chat:${sortedIds[0]}_${sortedIds[1]}`;
    const rawMessages = await redisClient.lRange(sessionKey, 0, -1);
    
    const chatLog = [];
    for (const msgStr of rawMessages) {
      try {
        const parsed = JSON.parse(msgStr);
        chatLog.push({
          senderId: parsed.senderId,
          senderUsername: parsed.senderUsername || (parsed.senderId === reporterId.toString() ? reporterUser?.username : reportedUser?.username || 'Stranger'),
          text: parsed.text,
          createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date()
        });
      } catch (err) {
        chatLog.push({
          senderId: 'unknown',
          senderUsername: 'Stranger',
          text: msgStr,
          createdAt: new Date()
        });
      }
    }

    // 3. Save report image upload if any
    const screenshotUrl = req.file ? `/uploads/${req.file.filename}` : '';

    // 4. Create database record
    const report = new Report({
      reporter: reporterId,
      reportedUser: targetId,
      reason: reason || 'No reason provided',
      screenshotUrl,
      chatLog,
      reportedUserIp,
      reporterIp
    });

    await report.save();

    // 5. Update user report count
    if (reportedUser) {
      reportedUser.reportsCount = (reportedUser.reportsCount || 0) + 1;
      await reportedUser.save();
    }

    // 6. Push real-time alerts to superadmins
    const admins = await User.find({ username: 'admin' });
    for (const admin of admins) {
      await createAndSendNotification({
        recipient: admin._id,
        sender: reporterId,
        type: 'new_report',
        message: `🚨 Report filed on ${reportedUser?.username || 'Stranger'}: ${reason}`
      });
    }

    // Emit global socket alert to trigger automatic admin reload
    if (global.io) {
      global.io.emit('admin_new_report_alert');
    }

    res.status(201).json({ success: true, message: 'Report submitted successfully.', report });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
