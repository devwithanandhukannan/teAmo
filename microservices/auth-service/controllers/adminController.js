import { User } from '../models/User.js';
import { Setting } from '../models/Setting.js';
import { Report } from '../models/Report.js';
import { encrypt, decrypt } from '../utils/crypto.js';
import { redisClient } from '../config/db.js';
import nodemailer from 'nodemailer';

export const saveSmtpSettings = async (req, res) => {
  const { host, port, user, password, secure, from, fromName } = req.body;

  if (!host || !port || !user || !from) {
    return res.status(400).json({ success: false, message: 'Missing required SMTP configurations.' });
  }

  try {
    let encryptedPassword = '';
    if (password) {
      encryptedPassword = encrypt(password);
    } else {
      const existing = await Setting.findOne({ key: 'smtp_config' });
      encryptedPassword = existing?.value?.encryptedPassword || '';
    }

    const value = {
      host,
      port,
      user,
      encryptedPassword,
      secure: secure === true || secure === 'true',
      from,
      fromName
    };

    await Setting.findOneAndUpdate(
      { key: 'smtp_config' },
      { key: 'smtp_config', value },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'SMTP credentials configured successfully.' });
  } catch (error) {
    console.error('SMTP save error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

export const getSmtpSettings = async (req, res) => {
  try {
    const smtpSetting = await Setting.findOne({ key: 'smtp_config' });
    if (!smtpSetting || !smtpSetting.value) {
      return res.json({ success: true, config: null });
    }
    const { host, port, user, secure, from, fromName, encryptedPassword } = smtpSetting.value;
    res.json({
      success: true,
      config: {
        host,
        port,
        user,
        secure,
        from,
        fromName,
        hasPassword: !!encryptedPassword
      }
    });
  } catch (error) {
    console.error('SMTP get error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

export const testSmtpSettings = async (req, res) => {
  const { host, port, user, password, secure, from, fromName } = req.body;

  if (!host || !port || !user || !from) {
    return res.status(400).json({ success: false, message: 'Missing required SMTP configurations.' });
  }

  try {
    let decryptedPassword = '';
    if (password) {
      decryptedPassword = password;
    } else {
      const existing = await Setting.findOne({ key: 'smtp_config' });
      const encryptedPassword = existing?.value?.encryptedPassword || '';
      if (encryptedPassword) {
        decryptedPassword = decrypt(encryptedPassword);
      }
    }

    const transportConfig = {
      auth: {
        user,
        pass: decryptedPassword
      }
    };

    if (host && (host.toLowerCase().includes('gmail') || host.toLowerCase().includes('googlemail') || host.toLowerCase().includes('smtp.gmail.com'))) {
      transportConfig.service = 'gmail';
    } else {
      transportConfig.host = host;
      transportConfig.port = parseInt(port, 10);
      transportConfig.secure = secure === 'true' || secure === true;
    }

    const transporter = nodemailer.createTransport(transportConfig);
    await transporter.verify();

    res.json({ success: true, message: 'SMTP connection established and verified successfully!' });
  } catch (error) {
    console.error('SMTP verification failed:', error);
    res.status(400).json({ success: false, message: error.message || 'SMTP connection failed.' });
  }
};

export const getAdminAnalytics = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const onlineUsers = await redisClient.hLen('online_sockets');
    const offlineUsers = Math.max(totalUsers - onlineUsers, 0);

    // Dynamic stats
    const thresholdSetting = await Setting.findOne({ key: 'live_threshold' });
    const liveThreshold = thresholdSetting ? parseInt(thresholdSetting.value, 10) : 1000;

    const topActiveUsers = await User.find({ username: { $ne: 'admin' } })
      .select('username email avatarUrl totalOnlineTime')
      .sort({ totalOnlineTime: -1 })
      .limit(5);

    // Call chat service or publish to get counts if needed, but simple mongoose counts are fine for admin metrics
    res.json({
      success: true,
      analytics: {
        totalUsers,
        onlineUsers,
        offlineUsers,
        liveThreshold,
        topActiveUsers
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const banUser = async (req, res) => {
  const userId = req.params.id;
  const { reason } = req.body;
  try {
    const user = await User.findByIdAndUpdate(userId, { isBanned: true, banReason: reason || '' }, { new: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Publish ban event to Redis Pub/Sub so Chat Service disconnects the socket
    await redisClient.publish('admin_actions', JSON.stringify({
      action: 'ban',
      userId
    }));

    res.json({ success: true, user, message: 'User has been banned.' });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const unbanUser = async (req, res) => {
  const userId = req.params.id;
  try {
    const user = await User.findByIdAndUpdate(userId, { isBanned: false, banReason: '', reportsCount: 0 }, { new: true });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user, message: 'User has been unbanned.' });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const forceMatchUser = async (req, res) => {
  const targetUserId = req.params.id;
  const adminId = req.user._id.toString();
  const { mode } = req.query;

  try {
    const targetSocketId = await redisClient.hGet('online_sockets', targetUserId);
    if (!targetSocketId) {
      return res.status(400).json({ success: false, message: 'Target user is offline.' });
    }

    // Publish to Redis Pub/Sub for Chat service to handle matchmaking
    await redisClient.publish('admin_actions', JSON.stringify({
      action: 'force_match',
      adminId,
      targetUserId,
      mode: mode || 'video'
    }));

    res.json({ success: true, message: 'Match request sent to Chat service.' });
  } catch (error) {
    console.error('Force match error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const saveLiveThreshold = async (req, res) => {
  const { threshold } = req.body;
  if (threshold === undefined) {
    return res.status(400).json({ success: false, message: 'Threshold value required.' });
  }

  try {
    await Setting.findOneAndUpdate(
      { key: 'live_threshold' },
      { key: 'live_threshold', value: threshold.toString() },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: `Live capacity threshold set to ${threshold}.` });
  } catch (error) {
    console.error('Threshold save error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

export const getUsersList = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    console.error('Get users list error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getReportsList = async (req, res) => {
  try {
    const reports = await Report.find()
      .populate('reporter', 'username email avatarUrl lastIp')
      .populate('reportedUser', 'username email avatarUrl lastIp')
      .sort({ createdAt: -1 });
    res.json({ success: true, reports });
  } catch (error) {
    console.error('Get reports list error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
