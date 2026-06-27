import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { redisClient } from '../config/db.js';

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretjwtkeyforstrangermatches', {
    expiresIn: '30d'
  });
};

// Check if username or email exists in real-time
export const checkExists = async (req, res) => {
  const { username, email } = req.body;
  try {
    const usernameExists = username ? await User.findOne({ username: username.toLowerCase() }) : null;
    const emailExists = email ? await User.findOne({ email: email.toLowerCase() }) : null;
    
    res.json({
      success: true,
      usernameExists: !!usernameExists,
      emailExists: !!emailExists
    });
  } catch (error) {
    console.error('Check exists error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Register user - kicks off Magic Link Verification Flow
export const register = async (req, res) => {
  const { username, email, password } = req.body;
  
  try {
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all details' });
    }

    const usernameClean = username.toLowerCase().trim();
    const emailClean = email.toLowerCase().trim();

    const usernameExists = await User.findOne({ username: usernameClean });
    if (usernameExists) {
      return res.status(400).json({ success: false, message: 'Username is already taken' });
    }

    const emailExists = await User.findOne({ email: emailClean });
    if (emailExists) {
      return res.status(400).json({ success: false, message: 'Email is already registered' });
    }

    // Create the User (pending email verification)
    const user = await User.create({
      username: usernameClean,
      email: emailClean,
      password,
      isEmailVerified: false
    });

    // Generate a secure auth session token (magic link token)
    const authSessionId = crypto.randomUUID();

    // Store the pending verification status in Redis (valid for 5 minutes)
    const sessionData = {
      userId: user._id.toString(),
      email: emailClean,
      verified: false,
      type: 'register'
    };
    await redisClient.setEx(`pending_login:${authSessionId}`, 300, JSON.stringify(sessionData));

    // Push job to notification service queue
    const mailJob = {
      type: 'login_verification',
      email: emailClean,
      token: authSessionId
    };
    await redisClient.rPush('email_jobs', JSON.stringify(mailJob));

    console.log(`[Auth Service] Register success, generated authSessionId: ${authSessionId} for ${emailClean}`);

    res.status(201).json({
      success: true,
      pendingVerification: true,
      authSessionId,
      email: emailClean,
      message: 'A verification link has been sent to your email. Please click it to complete registration.'
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Login user - initiates Magic Link Verification
export const login = async (req, res) => {
  const { loginIdentifier, password } = req.body;
  
  try {
    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Please provide credentials' });
    }

    const identifierClean = loginIdentifier.toLowerCase().trim();
    const query = identifierClean.includes('@') 
      ? { email: identifierClean } 
      : { username: identifierClean };
      
    const user = await User.findOne(query);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: `This account has been banned. Reason: ${user.banReason || 'None'}` });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // BYPASS email validation for the "admin" account to ensure admin utility works easily
    if (user.username === 'admin') {
      console.log('[Auth Service] Admin login bypass email verification.');
      return res.json({
        success: true,
        token: generateToken(user._id),
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          interests: user.interests,
          avatarUrl: user.avatarUrl,
          trustRank: user.trustRank,
          isAnonymous: user.isAnonymous
        }
      });
    }

    // Generate secure login session ID
    const authSessionId = crypto.randomUUID();

    // Save pending login intent in Redis with 5 minutes TTL
    const sessionData = {
      userId: user._id.toString(),
      email: user.email,
      verified: false,
      type: 'login'
    };
    await redisClient.setEx(`pending_login:${authSessionId}`, 300, JSON.stringify(sessionData));

    // Queue verification email
    const mailJob = {
      type: 'login_verification',
      email: user.email,
      token: authSessionId
    };
    await redisClient.rPush('email_jobs', JSON.stringify(mailJob));

    console.log(`[Auth Service] Login initiated, generated authSessionId: ${authSessionId} for ${user.email}`);

    res.json({
      success: true,
      pendingVerification: true,
      authSessionId,
      email: user.email,
      message: 'A verification link has been sent to your email. Click it to authorize this login.'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Verify the Magic Link Clicked by the User
export const verifyLoginLink = async (req, res) => {
  const { token, email } = req.body;

  if (!token || !email) {
    return res.status(400).json({ success: false, message: 'Token and email are required.' });
  }

  try {
    const sessionStr = await redisClient.get(`pending_login:${token}`);
    if (!sessionStr) {
      return res.status(400).json({ success: false, message: 'Verification link expired or invalid.' });
    }

    const session = JSON.parse(sessionStr);
    if (session.email.toLowerCase() !== email.toLowerCase().trim()) {
      return res.status(400).json({ success: false, message: 'Email mismatch.' });
    }

    // Verify user in Database
    const user = await User.findById(session.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (user.isBanned) {
      return res.status(403).json({ success: false, message: 'This user account is banned.' });
    }

    // If unverified registration, set verified
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      await user.save();
      console.log(`[Auth Service] User ${user.email} is now email verified.`);
    }

    const jwtToken = generateToken(user._id);
    const userInfo = {
      _id: user._id,
      username: user.username,
      email: user.email,
      interests: user.interests,
      avatarUrl: user.avatarUrl,
      trustRank: user.trustRank,
      isAnonymous: user.isAnonymous
    };

    // Update Redis session data to active & verified so polling can read it
    const activeSession = {
      userId: user._id.toString(),
      email: user.email,
      verified: true,
      token: jwtToken,
      user: userInfo
    };
    // Keep it in Redis for another 30 seconds for polling fallback to retrieve
    await redisClient.setEx(`pending_login:${token}`, 30, JSON.stringify(activeSession));

    // Publish verified login event to Redis Pub/Sub for WebSockets redirect synchronization
    await redisClient.publish(`login_verified:${token}`, JSON.stringify({
      token: jwtToken,
      user: userInfo
    }));

    console.log(`[Auth Service] Session ${token} validated successfully.`);

    res.json({
      success: true,
      token: jwtToken,
      user: userInfo
    });
  } catch (error) {
    console.error('Verify login link error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Check Login Session status (Polling Fallback)
export const getLoginStatus = async (req, res) => {
  const { authSessionId } = req.params;

  try {
    const sessionStr = await redisClient.get(`pending_login:${authSessionId}`);
    if (!sessionStr) {
      return res.json({ success: true, status: 'expired' });
    }

    const session = JSON.parse(sessionStr);
    if (session.verified) {
      // Session has been authorized! Clean it up.
      await redisClient.del(`pending_login:${authSessionId}`);
      return res.json({
        success: true,
        status: 'verified',
        token: session.token,
        user: session.user
      });
    }

    return res.json({
      success: true,
      status: 'pending'
    });
  } catch (error) {
    console.error('Check login status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Forgot Password Request
export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  
  try {
    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide email' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account with that email' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpire = Date.now() + 3600000;
    await user.save();

    // Queue password reset email
    const mailJob = {
      type: 'password_reset',
      email: user.email,
      token: resetToken
    };
    await redisClient.rPush('email_jobs', JSON.stringify(mailJob));
    
    res.json({ 
      success: true, 
      message: 'Password reset link sent.', 
      mockToken: resetToken // fallback representation
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Reset Password Flow
export const resetPassword = async (req, res) => {
  const { token, email, password } = req.body;
  
  try {
    if (!token || !email || !password) {
      return res.status(400).json({ success: false, message: 'Invalid reset payload' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
