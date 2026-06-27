import { Notification } from '../models/Notification.js';
import { redisClient } from '../config/db.js';

export const createAndSendNotification = async ({ recipient, sender, type, message }) => {
  try {
    // 1. Create in database
    const notification = await Notification.create({
      recipient,
      sender,
      type,
      message
    });

    // 2. Fetch populated details
    const populated = await Notification.findById(notification._id)
      .populate('sender', 'username avatarUrl')
      .exec();

    // 3. Check if recipient is online in Redis
    if (global.io && redisClient) {
      const socketId = await redisClient.hGet('online_sockets', recipient.toString());
      if (socketId) {
        // Emit real-time notification socket event
        global.io.to(socketId).emit('new_notification', populated);
        console.log(`[Notification Service] Dispatched real-time socket notification to ${recipient}: ${message}`);
      }
    }

    return populated;
  } catch (error) {
    console.error('Error creating/sending notification:', error);
  }
};
