import mongoose from 'mongoose';

const snapSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Expire after 24 hours (in seconds)
  }
});

export const Snap = mongoose.model('Snap', snapSchema);
