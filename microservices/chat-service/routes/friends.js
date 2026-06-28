import express from 'express';
import { 
  followUser, unfollowUser, getFriendsList, trustLikeUser, scanNearbyUsers, getDirectMessages, removeFriend 
} from '../controllers/friendsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/follow/:id', protect, followUser);
router.delete('/follow/:id', protect, unfollowUser);   // Unlike / unfollow
router.delete('/remove/:id', protect, removeFriend);    // Unfriend
router.get('/list', protect, getFriendsList);
router.post('/trust-like/:id', protect, trustLikeUser);
router.post('/scan', protect, scanNearbyUsers);

// WhatsApp-style message logs for permanent friends
router.get('/messages/:friendId', protect, getDirectMessages);

export default router;
