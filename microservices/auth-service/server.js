import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectMongo, connectRedis } from './config/db.js';

// Route Imports
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5004;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount REST Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/admin', adminRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'Auth Service' });
});

// Database Connection & Server Init
const startServer = async () => {
  try {
    // 1. Connect MongoDB
    await connectMongo();
    
    // 2. Connect Redis
    await connectRedis();

    console.log('Auth Service: DB connections established.');

    // Start Listening
    app.listen(PORT, () => {
      console.log(`Auth Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Auth Service startup error:', error.message);
    process.exit(1);
  }
};

startServer();
