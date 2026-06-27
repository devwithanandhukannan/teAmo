import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Snap } from '../models/Snap.js';
import { Friendship } from '../models/Friendship.js';
import { Notification } from '../models/Notification.js';

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
      await Notification.create({
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
