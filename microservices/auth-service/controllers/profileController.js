import { User } from '../models/User.js';

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const updateProfile = async (req, res) => {
  const { 
    username, interests, avatarUrl, isAnonymous, coordinates,
    about, hobbies, education, job, preference, notifyWhenOnline
  } = req.body;
  
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (username !== undefined && username.trim() !== '') {
      const cleanUsername = username.toLowerCase().trim();
      if (cleanUsername.length < 3) {
        return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
      }
      if (cleanUsername !== user.username) {
        const existing = await User.findOne({ username: cleanUsername });
        if (existing) {
          return res.status(400).json({ success: false, message: 'Username is already taken.' });
        }
        user.username = cleanUsername;
      }
    }

    if (interests !== undefined) {
      if (interests.length > 4) {
        return res.status(400).json({ success: false, message: 'You can select at most 4 interests.' });
      }
      user.interests = interests;
    }

    if (avatarUrl !== undefined) user.avatarUrl = avatarUrl;
    if (isAnonymous !== undefined) user.isAnonymous = isAnonymous;
    if (about !== undefined) user.about = about;
    if (hobbies !== undefined) user.hobbies = hobbies;
    if (education !== undefined) user.education = education;
    if (job !== undefined) user.job = job;
    if (preference !== undefined) user.preference = preference;
    if (notifyWhenOnline !== undefined) user.notifyWhenOnline = notifyWhenOnline;

    if (coordinates !== undefined && Array.isArray(coordinates) && coordinates.length === 2) {
      user.location = {
        type: 'Point',
        coordinates: [parseFloat(coordinates[0]), parseFloat(coordinates[1])]
      };
    }

    await user.save();
    res.json({ success: true, user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
