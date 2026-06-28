import express from 'express';
import { 
  saveSmtpSettings, getSmtpSettings, testSmtpSettings,
  getAdminAnalytics, banUser, unbanUser, forceMatchUser,
  saveLiveThreshold, getUsersList, getReportsList
} from '../controllers/adminController.js';
import { adminProtect } from '../middleware/auth.js';

const router = express.Router();

router.post('/smtp', adminProtect, saveSmtpSettings);
router.get('/smtp', adminProtect, getSmtpSettings);
router.post('/smtp/test', adminProtect, testSmtpSettings);

router.get('/analytics', adminProtect, getAdminAnalytics);
router.get('/users', adminProtect, getUsersList);
router.get('/reports', adminProtect, getReportsList);

router.post('/users/:id/ban', adminProtect, banUser);
router.post('/users/:id/unban', adminProtect, unbanUser);
router.post('/users/:id/match', adminProtect, forceMatchUser);

router.post('/live-threshold', adminProtect, saveLiveThreshold);

export default router;
