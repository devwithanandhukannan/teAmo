import express from 'express';
import { 
  register, login, forgotPassword, resetPassword, 
  checkExists, verifyLoginLink, getLoginStatus 
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/check-exists', checkExists);

// Magic Link click verification
router.post('/verify-login', verifyLoginLink);

// Polling login session status
router.get('/login-status/:authSessionId', getLoginStatus);

export default router;
