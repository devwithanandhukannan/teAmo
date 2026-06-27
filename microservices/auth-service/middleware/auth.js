import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export const protect = async (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforstrangermatches');
      
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Not authorized, user not found' });
      }
      
      if (req.user.isBanned) {
        return res.status(403).json({ success: false, message: 'This account has been banned' });
      }
      
      next();
    } catch (error) {
      console.error('Auth verification error:', error);
      res.status(401).json({ success: false, message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }
};

export const adminProtect = async (req, res, next) => {
  await protect(req, res, () => {
    if (req.user && req.user.username === 'admin') {
      next();
    } else {
      res.status(403).json({ success: false, message: 'Not authorized as an admin' });
    }
  });
};
