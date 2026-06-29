import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Db Connections
import { connectMongo, connectRedis, redisClient } from './config/db.js';
import { User } from './models/User.js';

// Route Imports
import friendsRoutes from './routes/friends.js';
import snapsRoutes from './routes/snaps.js';
import notificationRoutes from './routes/notifications.js';

// Socket Handlers
import { handleSocketConnections } from './sockets/chat.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Configure Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Set global IO instance so controllers and sockets can emit events
global.io = io;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount REST Routes
app.use('/api/friends', friendsRoutes);
app.use('/api/snaps', snapsRoutes);
app.use('/api/notifications', notificationRoutes);

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, '../../backend/public/uploads')));
// When running inside a container, path should fall back to /app/public/uploads if it is mounted there
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'Chat & WebSockets Service' });
});

// Database Connection & Server Init
const startServer = async () => {
  try {
    // 1. Connect MongoDB
    await connectMongo();
    
    // 2. Connect Redis
    await connectRedis();

    // Clear stale Redis keys on startup
    await redisClient.del('online_sockets');
    await redisClient.del('socket_users');
    await redisClient.del('online_user_count');
    await redisClient.del('active_matches');
    console.log('Redis: Cleared stale socket maps');

    // Reset MongoDB user online statuses
    await User.updateMany({}, { isOnline: false });
    console.log('MongoDB: Reset isOnline status for all users');

    // 3. Setup Socket Event Listeners
    handleSocketConnections(io);

    // 4. Redis Pub/Sub Subscriber for cross-service events
    const redisSubscriber = redisClient.duplicate();
    await redisSubscriber.connect();

    // Listen to Login Verification link successes to redirect the browser client in real-time
    await redisSubscriber.pSubscribe('login_verified:*', (message, channel) => {
      const authSessionId = channel.split(':')[1];
      console.log(`[Chat Service] login_verified PubSub received for session ${authSessionId}`);
      try {
        const data = JSON.parse(message);
        // Emit to the specific session room
        io.to(`login_session:${authSessionId}`).emit('login_success', data);
      } catch (err) {
        console.error('Error parsing login_verified message:', err);
      }
    });

    // Listen to Admin Actions (ban, force matchmaking)
    await redisSubscriber.subscribe('admin_actions', async (message) => {
      try {
        const data = JSON.parse(message);
        console.log(`[Chat Service] admin_actions PubSub received:`, data);
        
        if (data.action === 'ban') {
          const socketId = await redisClient.hGet('online_sockets', data.userId);
          if (socketId) {
            io.to(socketId).emit('banned');
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.disconnect(true);
            console.log(`[Chat Service] Banned user socket disconnected: ${data.userId}`);
          }
        } else if (data.action === 'force_match') {
          const { adminId, targetUserId, mode } = data;
          const adminSocketId = await redisClient.hGet('online_sockets', adminId);
          const targetSocketId = await redisClient.hGet('online_sockets', targetUserId);
          
          if (adminSocketId && targetSocketId) {
            // Helper to skip existing match
            const skipUser = async (uid) => {
              const oppId = await redisClient.hGet('active_matches', uid);
              await redisClient.hDel('active_matches', uid);
              if (oppId) {
                await redisClient.hDel('active_matches', oppId);
                const oppSocket = await redisClient.hGet('online_sockets', oppId);
                if (oppSocket) {
                  io.to(oppSocket).emit('match_skipped');
                }
              }
            };
            
            await skipUser(adminId);
            await skipUser(targetUserId);
            
            const { removeUserFromMatchingPool } = await import('./services/matchmaker.js');
            await removeUserFromMatchingPool(adminId);
            await removeUserFromMatchingPool(targetUserId);
            
            await redisClient.hSet('active_matches', adminId, targetUserId);
            await redisClient.hSet('active_matches', targetUserId, adminId);
            
            io.to(targetSocketId).emit('force_match_redirect', { mode });
            
            const targetUser = await User.findById(targetUserId).select('username avatarUrl trustRank isAnonymous interests');
            io.to(adminSocketId).emit('match_found', {
              opponent: targetUser,
              sharedInterests: [],
              isCaller: true
            });
            console.log(`[Chat Service] Successfully force matched admin ${adminId} and user ${targetUserId}`);
          }
        }
      } catch (err) {
        console.error('Error processing admin_actions message:', err);
      }
    });

    console.log('[Chat Service] Redis Pub/Sub subscriptions active.');

    // 5. Start Listening
    const PORT = process.env.PORT || 5003;
    httpServer.listen(PORT, () => {
      console.log(`Chat & WebSockets Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Chat Service startup error:', error.message);
    process.exit(1);
  }
};

startServer();
