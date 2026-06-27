import express from 'express';
import { createSnap, getSnapsFeed, deleteSnap, upload } from '../controllers/snapsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, upload.single('image'), createSnap);
router.get('/', protect, getSnapsFeed);
router.delete('/:id', protect, deleteSnap);

export default router;
