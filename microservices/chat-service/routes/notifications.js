import express from 'express';
import { getNotifications, clearNotifications } from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getNotifications);
router.delete('/', protect, clearNotifications);

export default router;
