import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportedGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  reason: {
    type: String,
    required: true
  },
  screenshotUrl: {
    type: String // Local storage path or base64 data URI
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const Report = mongoose.model('Report', reportSchema);
