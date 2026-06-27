import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  interests: {
    type: [String],
    default: [],
    validate: [
      (arr) => arr.length <= 4,
      'You can select at most 4 interests.'
    ]
  },
  avatarUrl: {
    type: String,
    default: 'https://api.dicebear.com/7.x/bottts/svg?seed=Stranger' // Premium dynamic avatar
  },
  trustRank: {
    type: Number,
    default: 100, // Starts at 100%, goes up when rated highly by opponents, goes down when reported
    min: 0,
    max: 200
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: {
    type: String,
    default: ''
  },
  reportsCount: {
    type: Number,
    default: 0
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  isOnline: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  about: {
    type: String,
    default: ''
  },
  hobbies: {
    type: [String],
    default: []
  },
  education: {
    type: String,
    default: ''
  },
  job: {
    type: String,
    default: ''
  },
  preference: {
    type: String,
    default: ''
  },
  emailOtp: String,
  emailOtpExpires: Date,
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  tempEmail: String,
  tempEmailOtp: String,
  tempEmailOtpExpires: Date,
  followersCount: {
    type: Number,
    default: 0
  },
  followingCount: {
    type: Number,
    default: 0
  },
  totalOnlineTime: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index location for geospatial queries
userSchema.index({ location: '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model('User', userSchema);
