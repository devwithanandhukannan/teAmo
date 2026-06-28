import express from 'express';
import { 
  followUser, acceptFollow, rejectFollow, unfollowUser, getRelationshipStatus, getFriendsList, trustLikeUser, scanNearbyUsers, getDirectMessages, removeFriend 
} from '../controllers/friendsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/follow/:id', protect, followUser);
router.post('/follow/:id/accept', protect, acceptFollow);
router.post('/follow/:id/reject', protect, rejectFollow);
router.delete('/follow/:id', protect, unfollowUser);   // Unlike / unfollow
router.get('/status/:id', protect, getRelationshipStatus);
router.delete('/remove/:id', protect, removeFriend);    // Unfriend
router.get('/list', protect, getFriendsList);
router.post('/trust-like/:id', protect, trustLikeUser);
router.post('/scan', protect, scanNearbyUsers);

// WhatsApp-style message logs for permanent friends
router.get('/messages/:friendId', protect, getDirectMessages);

export default router;
