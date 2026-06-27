import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'Gateway' });
});

// Configure backend microservice targets
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:5004';
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:5003';

console.log(`Gateway: Routing auth requests to ${AUTH_SERVICE_URL}`);
console.log(`Gateway: Routing chat & socket requests to ${CHAT_SERVICE_URL}`);

// Auth Service routes proxy
app.use('/api/auth', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use('/api/profile', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use('/api/admin', createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

// Chat & Websockets Service routes proxy
app.use('/api/friends', createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use('/api/snaps', createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

app.use('/api/notifications', createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

// Websocket connection proxy (crucial to enable ws: true and matching paths)
app.use('/socket.io', createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  logLevel: 'debug'
}));

// Serve static uploads
const uploadsDir = path.join(__dirname, '../../backend/public/uploads');
app.use('/uploads', express.static(uploadsDir));

// Index fallback
app.get('/', (req, res) => {
  res.json({ message: 'Stranger Match Gateway is running.' });
});

// Start Gateway
app.listen(PORT, () => {
  console.log(`Gateway service running on port ${PORT}`);
});
