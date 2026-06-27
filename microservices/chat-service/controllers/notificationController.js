import { Notification } from '../models/Notification.js';

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .populate('sender', 'username avatarUrl')
      .sort({ createdAt: -1 });

    res.json({ success: true, notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const clearNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user._id });
    res.json({ success: true, message: 'All notifications cleared.' });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
