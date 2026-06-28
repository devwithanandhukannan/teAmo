import express from 'express';
import { createSnap, getSnapsFeed, deleteSnap, createReport, upload } from '../controllers/snapsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, upload.single('image'), createSnap);
router.post('/report', protect, upload.single('screenshot'), createReport);
router.get('/', protect, getSnapsFeed);
router.delete('/:id', protect, deleteSnap);

export default router;
