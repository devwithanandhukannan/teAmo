import mongoose from 'mongoose';
import { createClient } from 'redis';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { decrypt } from './crypto.js';

dotenv.config();

// MongoDB Connection
const connectMongo = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI env is missing. Cannot fetch SMTP settings.');
    return null;
  }
  try {
    const conn = await mongoose.connect(uri);
    console.log(`Notification Worker: Connected to MongoDB at ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('Notification Worker: MongoDB Connection Error:', error.message);
    return null;
  }
};

// Define dynamic Setting schema
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { collection: 'settings' }); // Explicit collection name
const Setting = mongoose.models.Setting || mongoose.model('Setting', settingSchema);

// Dynamically create transporter based on database configuration
const getTransporter = async () => {
  try {
    const smtpSetting = await Setting.findOne({ key: 'smtp_config' });
    
    if (!smtpSetting || !smtpSetting.value) {
      console.warn('Notification Worker: SMTP settings not configured in MongoDB. Defaulting to Mock console output.');
      return null;
    }
    
    const { host, port, user, encryptedPassword, secure, from, fromName } = smtpSetting.value;
    
    let decryptedPassword = '';
    if (encryptedPassword) {
      decryptedPassword = decrypt(encryptedPassword);
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

    const fromAddress = fromName ? `"${fromName}" <${from || user}>` : (from || user);

    return {
      transporter: nodemailer.createTransport(transportConfig),
      from: fromAddress
    };
  } catch (err) {
    console.error('Notification Worker: Error retrieving SMTP settings:', err.message);
    return null;
  }
};

// Functions to send emails
const sendVerificationEmail = async (email, token) => {
  const config = await getTransporter();
  const verifyUrl = `http://localhost:3000/verify-login?token=${token}&email=${email}`;
  
  if (!config) {
    console.log(`\n============================================\n[MOCK EMAIL WORKER FALLBACK]\nVerification Link for ${email} is:\n${verifyUrl}\n============================================\n`);
    return true;
  }
  
  const { transporter, from } = config;
  const mailOptions = {
    from,
    to: email,
    subject: 'Verify your login - Hangout',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #050505; color: #ffffff;">
        <h2 style="color: #6366f1; text-align: center;">Hangout by kneazllle</h2>
        <p style="color: #cccccc;">You requested a secure login verification link. Please click the button below to authorize this login session. This link is valid for <strong>5 minutes</strong>.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify and Log In</a>
        </div>
        <p style="color: #888888;">If the button doesn't work, copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #6366f1;">${verifyUrl}</p>
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666666; text-align: center;">If you did not request this login, please ignore this email.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Notification Worker] Verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`[Notification Worker] Error sending verification email to ${email}:`, error.message);
    return false;
  }
};

const sendPasswordResetEmail = async (email, token) => {
  const config = await getTransporter();
  const resetUrl = `http://localhost:3000/reset-password?token=${token}&email=${email}`;
  
  if (!config) {
    console.log(`\n============================================\n[MOCK EMAIL WORKER FALLBACK]\nPassword Reset Link for ${email} is:\n${resetUrl}\n============================================\n`);
    return true;
  }
  
  const { transporter, from } = config;
  const mailOptions = {
    from,
    to: email,
    subject: 'Reset your Password - Hangout',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #050505; color: #ffffff;">
        <h2 style="color: #6366f1; text-align: center;">Hangout by kneazllle</h2>
        <p style="color: #cccccc;">You requested a password reset. Please click the button below to set a new password. This link is valid for 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #888888;">If the button doesn't work, copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #6366f1;">${resetUrl}</p>
        <hr style="border: 0; border-top: 1px solid #333; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666666; text-align: center;">If you did not request this, please ignore this email.</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Notification Worker] Password reset email sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`[Notification Worker] Error sending password reset email to ${email}:`, error.message);
    return false;
  }
};

// Redis Client Setup
const startWorker = async () => {
  await connectMongo();

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const redisClient = createClient({ url: redisUrl });

  redisClient.on('error', (err) => console.error('[Notification Worker] Redis Error:', err));
  redisClient.on('connect', () => console.log('[Notification Worker] Connected to Redis'));

  try {
    await redisClient.connect();
  } catch (err) {
    console.error('[Notification Worker] Redis Connection Failed:', err.message);
    process.exit(1);
  }

  console.log('[Notification Worker] Waiting for jobs in Redis queue "email_jobs"...');

  while (true) {
    try {
      // blPop blocks until a job becomes available in the queue
      const jobResult = await redisClient.blPop('email_jobs', 0);
      if (jobResult && jobResult.element) {
        const job = JSON.parse(jobResult.element);
        console.log(`[Notification Worker] Received job of type "${job.type}" for ${job.email}`);

        let success = false;
        if (job.type === 'login_verification') {
          success = await sendVerificationEmail(job.email, job.token);
        } else if (job.type === 'password_reset') {
          success = await sendPasswordResetEmail(job.email, job.token);
        } else {
          console.warn(`[Notification Worker] Unknown job type: ${job.type}`);
        }

        if (!success) {
          console.warn(`[Notification Worker] Job execution failed for ${job.email}, putting back on queue or logging.`);
          // Optionally re-queue with retry count, but for now simple logging is sufficient
        }
      }
    } catch (err) {
      console.error('[Notification Worker] Loop Error:', err.message);
      // Wait a moment to avoid rapid tight loops on error
      await new Promise(r => setTimeout(r, 1000));
    }
  }
};

// Process termination handlers
process.on('SIGINT', async () => {
  console.log('[Notification Worker] Shutting down...');
  await mongoose.disconnect();
  process.exit(0);
});

startWorker();
