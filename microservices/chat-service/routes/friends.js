import express from 'express';
import { 
  followUser, getFriendsList, trustLikeUser, scanNearbyUsers, getDirectMessages 
} from '../controllers/friendsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/follow/:id', protect, followUser);
router.get('/list', protect, getFriendsList);
router.post('/trust-like/:id', protect, trustLikeUser);
router.post('/scan', protect, scanNearbyUsers);

// WhatsApp-style message logs for permanent friends
router.get('/messages/:friendId', protect, getDirectMessages);

export default router;
