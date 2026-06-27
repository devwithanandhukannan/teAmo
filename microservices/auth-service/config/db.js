import mongoose from 'mongoose';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

export const connectMongo = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Auth Service: MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error(`Auth Service: MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
export const redisClient = createClient({
  url: redisUrl
});

redisClient.on('error', (err) => console.error('Auth Service: Redis Client Error', err));
redisClient.on('connect', () => console.log('Auth Service: Redis Client Connected'));

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.error(`Auth Service: Redis Connection Error: ${error.message}`);
    process.exit(1);
  }
};
