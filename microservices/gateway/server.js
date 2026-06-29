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

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[Gateway] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'Gateway' });
});

// Configure backend microservice targets
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:5004';
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://localhost:5003';

console.log(`Gateway: Routing auth requests to ${AUTH_SERVICE_URL}`);
console.log(`Gateway: Routing chat & socket requests to ${CHAT_SERVICE_URL}`);

// Auth Service proxy (preserves prefixes by mounting at root with pathFilter)
app.use(createProxyMiddleware({
  target: AUTH_SERVICE_URL,
  changeOrigin: true,
  pathFilter: ['/api/auth', '/api/profile', '/api/admin']
}));

// Chat & Websockets REST routes proxy (preserves prefixes)
app.use(createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  pathFilter: ['/api/friends', '/api/snaps', '/api/notifications']
}));

// Websocket connection proxy (handles WS handshake at root)
app.use(createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  ws: true,
  pathFilter: '/socket.io'
}));

// Proxy static uploads to Chat Service
app.use(createProxyMiddleware({
  target: CHAT_SERVICE_URL,
  changeOrigin: true,
  pathFilter: '/uploads'
}));

// Index fallback
app.get('/', (req, res) => {
  res.json({ message: 'Stranger Match Gateway is running.' });
});

// Start Gateway
app.listen(PORT, () => {
  console.log(`Gateway service running on port ${PORT}`);
});
