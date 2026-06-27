import mongoose from 'mongoose';

const friendshipSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Ensure relationship is unique in both directions
friendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });

export const Friendship = mongoose.model('Friendship', friendshipSchema);
