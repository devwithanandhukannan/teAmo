'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Zap, Key } from 'lucide-react';
import { useToast } from './Toast';
import { getBackendUrl } from '@/config';

export const ProfileDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const { showToast } = useToast();

  // Profile forms
  const [editUsername, setEditUsername] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editAbout, setEditAbout] = useState('');
  const [editHobbies, setEditHobbies] = useState('');
  const [editEducation, setEditEducation] = useState('');
  const [editJob, setEditJob] = useState('');
  const [editPreference, setEditPreference] = useState('');
  const [editNotifyWhenOnline, setEditNotifyWhenOnline] = useState(true);
  const [editingInterests, setEditingInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');

  // Username validation
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'too-short'>('idle');

  // Email updates OTP flow
  const [newEmail, setNewEmail] = useState('');
  const [emailOtpStep, setEmailOtpStep] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [emailUpdateLoading, setEmailUpdateLoading] = useState(false);

  const backendUrl = getBackendUrl();

  // Load User profile
  const fetchProfile = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) {
        localStorage.clear();
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success) {
        setProfile(data.user);
        setEditUsername(data.user.username || '');
        setEditAvatarUrl(data.user.avatarUrl || '');
        setEditingInterests(data.user.interests || []);
        setEditAbout(data.user.about || '');
        setEditHobbies(data.user.hobbies ? data.user.hobbies.join(', ') : '');
        setEditEducation(data.user.education || '');
        setEditJob(data.user.job || '');
        setEditPreference(data.user.preference || '');
        setEditNotifyWhenOnline(data.user.notifyWhenOnline ?? true);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleOpenProfile = () => {
      setIsOpen(true);
      fetchProfile();
    };

    window.addEventListener('dock-open-profile', handleOpenProfile);
    return () => {
      window.removeEventListener('dock-open-profile', handleOpenProfile);
    };
  }, []);

  // Debounced Username Uniqueness Check
  useEffect(() => {
    if (!editUsername) {
      setUsernameStatus('idle');
      return;
    }

    const clean = editUsername.trim().toLowerCase();
    if (clean.length < 3) {
      setUsernameStatus('too-short');
      return;
    }

    // If it's unchanged, it's available
    if (profile && clean === profile.username) {
      setUsernameStatus('available');
      return;
    }

    setUsernameStatus('checking');

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/auth/check-exists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: clean })
        });
        const data = await res.json();
        if (data.success) {
          if (data.usernameExists) {
            setUsernameStatus('taken');
          } else {
            setUsernameStatus('available');
          }
        }
      } catch (err) {
        console.error(err);
        setUsernameStatus('idle');
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [editUsername, profile]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus === 'taken' || usernameStatus === 'too-short') {
      showToast('Please fix the username errors before saving.');
      return;
    }

    const token = localStorage.getItem('token');
    const hobbiesArr = editHobbies.split(',').map(h => h.trim()).filter(h => h.length > 0);

    try {
      const res = await fetch(`${backendUrl}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: editUsername,
          avatarUrl: editAvatarUrl,
          about: editAbout,
          hobbies: hobbiesArr,
          education: editEducation,
          job: editJob,
          preference: editPreference,
          interests: editingInterests,
          notifyWhenOnline: editNotifyWhenOnline
        })
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.user);
        
        // Update local storage user info
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          const userObj = JSON.parse(storedUser);
          userObj.username = data.user.username;
          userObj.avatarUrl = data.user.avatarUrl;
          localStorage.setItem('user', JSON.stringify(userObj));
        }

        // Notify pages to update state
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: data.user }));
        setIsOpen(false);
        showToast('Profile parameters updated.');
      } else {
        showToast(data.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Network error updating profile.');
    }
  };

  // Email updates flow
  const handleEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;

    setEmailUpdateLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/auth/update-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newEmail })
      });
      const data = await res.json();
      if (data.success) {
        setEmailOtpStep(true);
        showToast('OTP sent to new email. Please verify.');
        if (data.mockOtp) {
          showToast(`Mock OTP code: ${data.mockOtp}`);
        }
      } else {
        showToast(data.message || 'Email update request failed.');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error updating email.');
    } finally {
      setEmailUpdateLoading(false);
    }
  };

  const handleVerifyNewEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOtp) return;

    setEmailUpdateLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/auth/verify-new-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ otp: emailOtp })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Email address changed successfully.');
        setEmailOtpStep(false);
        setNewEmail('');
        setEmailOtp('');
        
        // Notify pages to update state
        window.dispatchEvent(new CustomEvent('profile-updated', { detail: data.user }));
        fetchProfile();
      } else {
        showToast(data.message || 'OTP verification failed.');
      }
    } catch (err) {
      console.error(err);
      showToast('Network error verifying OTP.');
    } finally {
      setEmailUpdateLoading(false);
    }
  };

  // Interests tags management
  const addInterestTag = () => {
    if (!interestInput.trim()) return;
    const tag = interestInput.trim().toLowerCase();
    if (editingInterests.includes(tag)) {
      setInterestInput('');
      return;
    }
    if (editingInterests.length >= 4) {
      showToast('You can select at most 4 interests.');
      return;
    }
    setEditingInterests([...editingInterests, tag]);
    setInterestInput('');
  };

  const removeInterestTag = (tag: string) => {
    setEditingInterests(editingInterests.filter(t => t !== tag));
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-md z-[999] flex items-center justify-end animate-in fade-in duration-300">
      {/* Sliding Drawer Body */}
      <div className="w-full max-w-md h-full bg-background border-l border-border p-6 flex flex-col justify-between overflow-y-auto shadow-2xl relative animate-in slide-in-from-right duration-300">
        
        <button 
          onClick={() => setIsOpen(false)} 
          className="absolute top-6 right-6 text-muted-foreground hover:text-foreground transition p-1 bg-secondary hover:bg-accent rounded-lg"
        >
          <X size={20} />
        </button>

        {loading && !profile ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-indigo-400" size={32} />
            <span className="text-xs text-muted-foreground mt-2">Loading credentials...</span>
          </div>
        ) : (
          profile && (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                
                {/* Header card displaying current user */}
                <div className="flex items-center gap-4 border-b border-border pb-4 mt-6">
                  <img 
                    src={editAvatarUrl || profile.avatarUrl} 
                    alt="Avatar" 
                    className="h-14 w-14 rounded-full border-2 border-indigo-500/50 bg-muted object-cover" 
                  />
                  <div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-tight flex items-center gap-1.5">
                      {profile.username} <Zap size={12} className="text-indigo-400" />
                    </h3>
                    <span className="text-[10px] text-indigo-400 font-bold block mt-0.5">Trust Rank: {profile.trustRank}%</span>
                  </div>
                </div>

                {/* Social count statistics */}
                <div className="grid grid-cols-2 gap-4 border-b border-border pb-4">
                  <div className="bg-card border border-border rounded-2xl p-3 text-center">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Followers</span>
                    <span className="text-base font-black text-foreground block mt-1">{profile.followersCount}</span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-3 text-center">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Following</span>
                    <span className="text-base font-black text-foreground block mt-1">{profile.followingCount}</span>
                  </div>
                </div>

                {/* Configuration form */}
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Basic Details</h4>
                  
                  {/* Username Field */}
                  <div>
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Username</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={editUsername}
                        onChange={(e) => setEditUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        required
                        className={`w-full p-2.5 text-xs rounded-xl glass-input font-bold pr-10 border ${
                          usernameStatus === 'available' ? 'border-green-500/30' :
                          usernameStatus === 'taken' || usernameStatus === 'too-short' ? 'border-red-500/30' : 'border-border'
                        }`}
                      />
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center">
                        {usernameStatus === 'checking' && <Loader2 className="animate-spin text-muted-foreground" size={14} />}
                        {usernameStatus === 'available' && <CheckCircle2 className="text-green-500" size={14} />}
                        {(usernameStatus === 'taken' || usernameStatus === 'too-short') && <AlertCircle className="text-red-500" size={14} />}
                      </div>
                    </div>
                    {usernameStatus === 'taken' && (
                      <span className="text-[9px] text-red-500 font-bold mt-1 block">Username is already taken</span>
                    )}
                    {usernameStatus === 'too-short' && (
                      <span className="text-[9px] text-red-500 font-bold mt-1 block">Username must be at least 3 characters</span>
                    )}
                    {usernameStatus === 'available' && (
                      <span className="text-[9px] text-green-500 font-bold mt-1 block">Username is available</span>
                    )}
                  </div>

                  {/* Avatar Predefined selector grid */}
                  <div>
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Select Avatar Icon</label>
                    <div className="grid grid-cols-4 gap-2 bg-card border border-border p-2 rounded-2xl max-h-64 overflow-y-auto">
                      {[
                        // Adventurer
                        'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix',
                        'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka',
                        'https://api.dicebear.com/7.x/adventurer/svg?seed=Jack',
                        'https://api.dicebear.com/7.x/adventurer/svg?seed=Jude',
                        // Bottts
                        'https://api.dicebear.com/7.x/bottts/svg?seed=Robo',
                        'https://api.dicebear.com/7.x/bottts/svg?seed=Cody',
                        'https://api.dicebear.com/7.x/bottts/svg?seed=Zia',
                        'https://api.dicebear.com/7.x/bottts/svg?seed=Buster',
                        // Pixel Art
                        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Pico',
                        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Lola',
                        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Riko',
                        'https://api.dicebear.com/7.x/pixel-art/svg?seed=Nina',
                        // Lorelei
                        'https://api.dicebear.com/7.x/lorelei/svg?seed=Luna',
                        'https://api.dicebear.com/7.x/lorelei/svg?seed=Leo',
                        'https://api.dicebear.com/7.x/lorelei/svg?seed=Milo',
                        'https://api.dicebear.com/7.x/lorelei/svg?seed=Sadie',
                        // Fun Emoji
                        'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Happy',
                        'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Cool',
                        'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Wink',
                        'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Love',
                        'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Star',
                        'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Laugh',
                        'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Sleepy',
                        'https://api.dicebear.com/7.x/fun-emoji/svg?seed=Shy',
                        // Avataaars
                        'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex',
                        'https://api.dicebear.com/7.x/avataaars/svg?seed=Sam',
                        'https://api.dicebear.com/7.x/avataaars/svg?seed=Nora',
                        'https://api.dicebear.com/7.x/avataaars/svg?seed=Max'
                      ].map((url) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setEditAvatarUrl(url)}
                          className={`h-11 w-11 rounded-full overflow-hidden p-[1.5px] border-2 transition ${
                            editAvatarUrl === url ? 'border-indigo-500 scale-105 bg-indigo-500/10' : 'border-border hover:border-border'
                          }`}
                        >
                          <img src={url} alt="Avatar" className="h-full w-full rounded-full bg-muted object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider border-t border-border pt-4">Dating Profile Details</h4>
                  
                  <div>
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">About Me</label>
                    <textarea
                      value={editAbout}
                      onChange={(e) => setEditAbout(e.target.value)}
                      rows={2}
                      className="w-full p-2.5 text-xs rounded-xl glass-input"
                    />
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Hobbies (comma-separated)</label>
                    <input
                      type="text"
                      value={editHobbies}
                      onChange={(e) => setEditHobbies(e.target.value)}
                      placeholder="travel, music, art..."
                      className="w-full p-2.5 text-xs rounded-xl glass-input"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Education</label>
                      <input
                        type="text"
                        value={editEducation}
                        onChange={(e) => setEditEducation(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl glass-input"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Job Role</label>
                      <input
                        type="text"
                        value={editJob}
                        onChange={(e) => setEditJob(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl glass-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Looking For</label>
                    <input
                      type="text"
                      value={editPreference}
                      onChange={(e) => setEditPreference(e.target.value)}
                      placeholder="e.g. Women / Men"
                      className="w-full p-2.5 text-xs rounded-xl glass-input"
                    />
                  </div>

                  {/* Interests configurator */}
                  <div className="border-t border-border pt-4">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">Interests (Max 4)</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editingInterests.map(tag => (
                        <span key={tag} className="inline-flex items-center gap-1 bg-secondary border border-border px-2.5 py-1 rounded-xl text-[10px] text-foreground font-bold">
                          #{tag}
                          <button type="button" onClick={() => removeInterestTag(tag)} className="text-red-400 hover:text-red-500 font-bold ml-1 text-xs">×</button>
                        </span>
                      ))}
                    </div>
                    {editingInterests.length < 4 && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Add tag"
                          value={interestInput}
                          onChange={(e) => setInterestInput(e.target.value)}
                          className="flex-1 p-2 text-xs rounded-xl glass-input"
                        />
                        <button type="button" onClick={addInterestTag} className="bg-white hover:bg-gray-200 text-black px-4 rounded-xl text-xs font-black transition">Add</button>
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-3">Privacy Settings</h4>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          className="sr-only" 
                          checked={editNotifyWhenOnline}
                          onChange={(e) => setEditNotifyWhenOnline(e.target.checked)}
                        />
                        <div className={`block w-10 h-6 rounded-full transition-colors ${editNotifyWhenOnline ? 'bg-white' : 'bg-secondary border border-border'}`}></div>
                        <div className={`absolute left-1 top-1 bg-black w-4 h-4 rounded-full transition-transform ${editNotifyWhenOnline ? 'translate-x-4 bg-black' : 'translate-x-0 bg-muted-foreground'}`}></div>
                      </div>
                      <span className="text-xs font-bold text-foreground group-hover:text-white transition">Notify friends when I come online</span>
                    </label>
                    <p className="text-[9px] text-muted-foreground mt-1 ml-12">If disabled, mutual friends won't be alerted when you log in.</p>
                  </div>

                  <button 
                    type="submit" 
                    className="w-full py-3 bg-white hover:bg-gray-200 text-black rounded-xl font-black text-xs tracking-wider uppercase transition shadow-lg mt-4"
                  >
                    Save Configuration
                  </button>
                </form>

                {/* Email update OTP workflow */}
                <div className="border-t border-border pt-4">
                  <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-wider mb-3">Modify Contact Email</h4>
                  {!emailOtpStep ? (
                    <form onSubmit={handleEmailRequest} className="space-y-3">
                      <input
                        type="email"
                        placeholder="Enter new email address"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="w-full p-2.5 text-xs rounded-xl glass-input"
                      />
                      <button 
                        type="submit" 
                        disabled={emailUpdateLoading || !newEmail}
                        className="w-full py-2.5 bg-secondary hover:bg-accent border border-border text-foreground text-xs font-bold rounded-xl transition flex items-center justify-center disabled:opacity-50"
                      >
                        {emailUpdateLoading ? <Loader2 className="animate-spin" size={14} /> : 'Send Verification OTP'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyNewEmail} className="space-y-3">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={emailOtp}
                        onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                        className="w-full py-2.5 text-center text-sm font-bold tracking-[6px] rounded-xl glass-input"
                      />
                      <button 
                        type="submit" 
                        disabled={emailUpdateLoading || emailOtp.length !== 6}
                        className="w-full py-2.5 bg-white hover:bg-gray-200 text-black text-xs font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center disabled:opacity-50"
                      >
                        {emailUpdateLoading ? <Loader2 className="animate-spin" size={14} /> : 'Verify Code'}
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setEmailOtpStep(false)}
                        className="text-[9px] text-muted-foreground hover:text-foreground block mx-auto mt-2"
                      >
                        Cancel modification
                      </button>
                    </form>
                  )}
                </div>

                {/* Logout Option */}
                <div className="border-t border-border pt-4">
                  <button 
                    onClick={handleLogout}
                    className="w-full py-2.5 bg-red-950/20 hover:bg-red-950/40 text-red-500 border border-red-500/10 rounded-xl text-xs font-black tracking-wider uppercase transition text-center"
                  >
                    Logout Session
                  </button>
                </div>

              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
