'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../components/Toast';
import { 
  Video, MessageSquare, Sparkles, UserPlus, Heart, Flag, 
  Send, RefreshCw, X, Loader2, CameraOff, VolumeX, ShieldAlert, 
  Shield, Edit3, Compass, Users, CheckCircle, HelpCircle, EyeOff
} from 'lucide-react';

interface Opponent {
  _id: string;
  username: string;
  avatarUrl: string;
  trustRank: number;
  isAnonymous: boolean;
}

interface ChatMsg {
  senderId: string;
  text: string;
  createdAt: Date;
}

interface UserProfile {
  _id: string;
  username: string;
  email: string;
  interests: string[];
  avatarUrl: string;
  trustRank: number;
  isAnonymous: boolean;
  about: string;
  hobbies: string[];
  education: string;
  job: string;
  preference: string;
  followersCount: number;
  followingCount: number;
}

export default function MatchPage() {
  const router = useRouter();
  const { socket, activeGroup, groupMessages } = useSocket();
  const { showToast } = useToast();

  // Profile data
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Match lifecycle
  const [mode, setMode] = useState<'text' | 'video'>('text');
  const [matchState, setMatchState] = useState<'idle' | 'searching' | 'connected' | 'group'>('idle');
  const [opponent, setOpponent] = useState<Opponent | null>(null);
  const [sharedInterests, setSharedInterests] = useState<string[]>([]);
  
  // Chat messaging & collapse states
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [messageText, setMessageText] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  
  // Media controls
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  // Social updates
  const [hasLiked, setHasLiked] = useState(false);
  const [hasTrustLiked, setHasTrustLiked] = useState(false);
  
  // Incognito Owl UI theme trigger
  const [incognitoMode, setIncognitoMode] = useState(false);
  
  // Report Modal states
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [reporting, setReporting] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  // Load User profile
  const fetchProfile = async () => {
    const token = localStorage.getItem('token');
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
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      router.push('/login');
      return;
    }
    
    const user = JSON.parse(userStr);
    if (user.username === 'admin') {
      router.push('/admin');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get('mode');
    if (modeParam === 'video' || modeParam === 'text') {
      setMode(modeParam as 'video' | 'text');
    }
    
    fetchProfile();

    // Check if Incognito was enabled globally on root body
    const isInc = document.body.classList.contains('incognito-mode');
    setIncognitoMode(isInc);

    // Listen to incognito toggles from floating header
    const handleIncognito = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIncognitoMode(customEvent.detail ?? false);
    };

    const handleProfileUpdated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setProfile(customEvent.detail);
      }
    };

    window.addEventListener('incognito-toggled', handleIncognito);
    window.addEventListener('profile-updated', handleProfileUpdated);
    return () => {
      window.removeEventListener('incognito-toggled', handleIncognito);
      window.removeEventListener('profile-updated', handleProfileUpdated);
    };
  }, []);
  

  // Sync state changes with Dock
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('match-status-changed', {
      detail: { state: matchState, mode }
    }));
  }, [matchState, mode]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('call-controls-updated', {
      detail: { audioMuted: isMuted, videoMuted: isCamOff, chatOpen }
    }));
  }, [isMuted, isCamOff, chatOpen]);

  // Connect layout listeners to bottom macOS Dock events
  useEffect(() => {
    const handleDockMuteAudio = () => toggleMute();
    const handleDockMuteVideo = () => toggleCam();
    const handleDockToggleChat = () => setChatOpen(prev => !prev);
    const handleDockSkip = () => handleSkipMatch();
    const handleDockExit = () => handleCancelSearch();
    const handleDockFriend = () => handleFollow();

    window.addEventListener('dock-mute-audio', handleDockMuteAudio);
    window.addEventListener('dock-mute-video', handleDockMuteVideo);
    window.addEventListener('dock-toggle-chat', handleDockToggleChat);
    window.addEventListener('dock-skip', handleDockSkip);
    window.addEventListener('dock-exit', handleDockExit);
    window.addEventListener('dock-friend', handleDockFriend);

    return () => {
      window.removeEventListener('dock-mute-audio', handleDockMuteAudio);
      window.removeEventListener('dock-mute-video', handleDockMuteVideo);
      window.removeEventListener('dock-toggle-chat', handleDockToggleChat);
      window.removeEventListener('dock-skip', handleDockSkip);
      window.removeEventListener('dock-exit', handleDockExit);
      window.removeEventListener('dock-friend', handleDockFriend);
    };
  }, [socket, matchState, opponent, isMuted, isCamOff, chatOpen]);

  // Socket triggers
  useEffect(() => {
    if (!socket) return;

    socket.on('waiting', () => {
      setMatchState('searching');
    });

    socket.on('match_found', async ({ opponent: opp, sharedInterests: shared, isCaller }) => {
      setOpponent(opp);
      setSharedInterests(shared || []);
      setChatLog([]);
      setHasLiked(false);
      setHasTrustLiked(false);
      setMatchState('connected');

      if (mode === 'video') {
        await startMediaAndCall(isCaller);
      }
    });

    socket.on('signal', async ({ signalData }) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        if (signalData.offer) {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { signalData: { answer } });
        } else if (signalData.answer) {
          await pc.setRemoteDescription(new RTCSessionDescription(signalData.answer));
        } else if (signalData.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        }
      } catch (err) {
        console.error(err);
      }
    });

    socket.on('match_message', ({ senderId, text }) => {
      setChatLog(prev => [...prev, { senderId, text, createdAt: new Date() }]);
    });

    socket.on('match_skipped', () => {
      closePeerAndMedia();
      setOpponent(null);
      setMatchState('idle');
      showToast('Stranger skipped the hangout.');
    });

    if (activeGroup) {
      closePeerAndMedia();
      setOpponent(null);
      setMatchState('group');
    }

    return () => {
      socket.off('waiting');
      socket.off('match_found');
      socket.off('signal');
      socket.off('match_message');
      socket.off('match_skipped');
    };
  }, [socket, mode, activeGroup]);

  // Media peer connection logic
  const startMediaAndCall = async (isCaller: boolean) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setLocalStream(stream);

      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('signal', { signalData: { candidate: event.candidate } });
        }
      };

      if (isCaller && socket) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { signalData: { offer } });
      }
    } catch (error) {
      console.error(error);
      showToast('Camera mic access denied. Operating in text mode.');
    }
  };

  const closePeerAndMedia = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const handleStartMatch = () => {
    if (!socket) return;
    setMatchState('searching');
    socket.emit('search_match');
  };

  const handleSkipMatch = () => {
    if (!socket) return;
    closePeerAndMedia();
    setOpponent(null);
    setMatchState('searching');
    socket.emit('skip_match');
    socket.emit('search_match');
  };

  const handleCancelSearch = () => {
    if (!socket) return;
    socket.emit('skip_match');
    setMatchState('idle');
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !socket) return;

    if (matchState === 'connected') {
      socket.emit('match_message', { text: messageText });
      setChatLog(prev => [...prev, { senderId: 'me', text: messageText, createdAt: new Date() }]);
    } else if (matchState === 'group' && activeGroup) {
      socket.emit('group_message', { groupId: activeGroup._id, text: messageText });
    }
    setMessageText('');
  };

  const handleFollow = async () => {
    if (!opponent) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/friends/follow/${opponent._id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setHasLiked(true);
        if (data.isMatch) {
          showToast('It is a match! Friend added.');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTrustLike = async () => {
    if (!opponent || hasTrustLiked) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/friends/trust-like/${opponent._id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setHasTrustLiked(true);
        setOpponent(prev => prev ? { ...prev, trustRank: data.trustRank } : null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportReason || !opponent) return;
    
    setReporting(true);
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('reportedUserId', opponent._id);
    formData.append('reason', reportReason);
    if (reportFile) {
      formData.append('image', reportFile);
    }

    try {
      const res = await fetch(`${backendUrl}/api/admin/report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast('Abuse report submitted. Skipping stranger.');
        setIsReportOpen(false);
        setReportReason('');
        setReportFile(null);
        handleSkipMatch();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReporting(false);
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsCamOff(!track.enabled);
      }
    }
  };


  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog, groupMessages]);

  const isLoungeConnected = matchState === 'connected' || matchState === 'group';

  return (
    <div className={`min-h-screen pt-24 pb-20 flex flex-col items-center px-4 relative overflow-hidden transition duration-500 bg-[#000000]`}>
      
      {/* Incognito background graphics */}
      {incognitoMode ? (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[140px] pointer-events-none"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-900/5 rounded-full blur-[140px] pointer-events-none"></div>
          {/* Owl silhouette mockup logo centered in background */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-3 select-none pointer-events-none text-purple-400">
            <EyeOff size={240} className="owl-neon" />
          </div>
        </>
      ) : (
        <>
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/5 rounded-full blur-[120px] pointer-events-none"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-gray-900/10 rounded-full blur-[120px] pointer-events-none"></div>
        </>
      )}

      <div className="w-full max-w-6xl flex flex-col flex-1 gap-6 relative z-10">
        
        {/* Profile Interests header (Only if idle) */}
        {matchState === 'idle' && profile && (
          <div className="glass-card rounded-2xl p-6 flex flex-col md:flex-row gap-6 justify-between items-start md:items-center">
            <div className="flex-1 w-full">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Interests (Max 4)</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {profile.interests.map(i => (
                  <span key={i} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${incognitoMode ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-white/5 text-white border-white/5'}`}>
                    #{i}
                  </span>
                ))}
                {profile.interests.length === 0 && <span className="text-xs text-gray-600">No active tags. Open Profile Settings below to add interests.</span>}
              </div>
            </div>

            <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Matching Mode</span>
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 mt-1">
                  <button
                    onClick={() => setMode('text')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === 'text' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    <MessageSquare size={13} /> Text
                  </button>
                  <button
                    onClick={() => setMode('video')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${mode === 'video' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
                  >
                    <Video size={13} /> Video
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Central visual panel */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch min-h-[460px]">
          
          {/* LEFT CONTAINER: Video tiles / graphical interface */}
          <div className={`${chatOpen && isLoungeConnected ? 'lg:col-span-7' : 'lg:col-span-12'} glass-card rounded-2xl p-4 flex flex-col justify-center items-center relative overflow-hidden bg-white/[0.01] transition-all duration-300`}>
            
            {matchState === 'idle' && (
              <div className="text-center p-8 flex flex-col items-center">
                <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mb-6 border ${incognitoMode ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/10 text-white'}`}>
                  <Sparkles size={28} className="animate-pulse" />
                </div>
                <h2 className="text-xl font-black text-white tracking-tight uppercase">Hangout Lounge</h2>
                <p className="text-xs text-gray-400 max-w-xs mt-1.5 mb-6">
                  Match with people around the world using interests or radar location.
                </p>
                <button
                  onClick={handleStartMatch}
                  className={`px-8 py-3.5 rounded-xl font-extrabold text-xs shadow-xl transition transform hover:scale-103 ${incognitoMode ? 'bg-purple-600 hover:bg-purple-500 text-white' : 'bg-white hover:bg-gray-200 text-black'}`}
                >
                  Match Stranger
                </button>
              </div>
            )}

            {matchState === 'searching' && (
              <div className="text-center p-8 flex flex-col items-center justify-center">
                <div className="relative h-28 w-28 mb-8 flex items-center justify-center">
                  <div className={`absolute inset-0 rounded-full border ripple-ring ${incognitoMode ? 'border-purple-500/20' : 'border-white/10'}`}></div>
                  <div className={`absolute inset-3 rounded-full border ripple-ring ${incognitoMode ? 'border-purple-500/30' : 'border-white/15'}`} style={{ animationDelay: '1s' }}></div>
                  <div className={`absolute inset-6 rounded-full border ripple-ring ${incognitoMode ? 'border-purple-500/40' : 'border-white/20'}`} style={{ animationDelay: '2s' }}></div>
                  <div className={`h-14 w-14 rounded-full flex items-center justify-center border ${incognitoMode ? 'bg-purple-950 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/10 text-white'}`}>
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                </div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Searching Seeker...</h3>
                <button
                  onClick={handleCancelSearch}
                  className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded-xl text-xs font-bold transition mt-6"
                >
                  Cancel
                </button>
              </div>
            )}

            {isLoungeConnected && (
              <div className="w-full h-full flex flex-col gap-4">
                
                {/* Peer bar */}
                <div className="flex justify-between items-center bg-white/[0.02] border border-white/5 p-3 rounded-xl">
                  <div className="flex items-center gap-3">
                    <img
                      src={opponent?.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=Stranger'}
                      alt="Avatar"
                      className="h-8 w-8 rounded-full border border-white/10 bg-gray-900"
                    />
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        {matchState === 'group' ? 'Temp Lounge Group' : (opponent?.isAnonymous ? 'Incognito Stranger' : opponent?.username)}
                      </h4>
                      {matchState === 'connected' && opponent && (
                        <span className="text-[10px] text-gray-500">Trust Index: {opponent.trustRank}%</span>
                      )}
                    </div>
                  </div>

                  {matchState === 'connected' && opponent && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleFollow}
                        disabled={hasLiked}
                        className={`p-2 rounded-lg text-xs font-bold transition flex items-center gap-1 ${hasLiked ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'}`}
                      >
                        <UserPlus size={14} />
                      </button>
                      <button
                        onClick={handleTrustLike}
                        disabled={hasTrustLiked}
                        className={`p-2 rounded-lg text-xs font-bold transition flex items-center gap-1 ${hasTrustLiked ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'}`}
                      >
                        <Heart size={14} />
                      </button>
                      <button
                        onClick={() => setIsReportOpen(true)}
                        className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-xs font-bold transition"
                      >
                        <Flag size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* HORIZONTAL VIDEO TILES */}
                {mode === 'video' && matchState === 'connected' ? (
                  <div className="flex-1 flex flex-col md:flex-row gap-4 items-stretch relative min-h-[300px]">
                    {/* Remote Screen */}
                    <div className="flex-1 bg-black/60 rounded-xl overflow-hidden border border-white/5 relative flex items-center justify-center aspect-video md:aspect-auto">
                      <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-3 left-3 bg-black/70 px-2.5 py-1 rounded text-[10px] font-bold border border-white/5">
                        Stranger
                      </span>
                    </div>

                    {/* Local Screen */}
                    <div className="flex-1 bg-black/60 rounded-xl overflow-hidden border border-white/5 relative flex items-center justify-center aspect-video md:aspect-auto">
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-3 left-3 bg-black/70 px-2.5 py-1 rounded text-[10px] font-bold border border-white/5">
                        You
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Graphical Placeholder */
                  <div className="flex-1 flex flex-col items-center justify-center border border-white/5 rounded-xl py-12">
                    <div className="flex gap-6 items-center">
                      <img
                        src="https://api.dicebear.com/7.x/bottts/svg?seed=You"
                        alt="You"
                        className="h-16 w-16 rounded-full border border-white/10 bg-gray-950"
                      />
                      <div className="h-6 w-16 flex justify-around items-center">
                        <span className="h-2 w-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></span>
                        <span className="h-4 w-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                        <span className="h-2 w-1 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }}></span>
                      </div>
                      {matchState === 'connected' ? (
                        <img
                          src={opponent?.avatarUrl}
                          alt="Opponent"
                          className="h-16 w-16 rounded-full border border-white/10 bg-gray-950"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-full border border-white/5 bg-gray-950 flex items-center justify-center">
                          <Users size={22} className="text-gray-500 animate-pulse" />
                        </div>
                      )}
                    </div>
                    {matchState === 'connected' && sharedInterests.length > 0 && (
                      <div className="mt-8 flex flex-col items-center">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">Common tags</span>
                        <div className="flex gap-1.5">
                          {sharedInterests.map(i => (
                            <span key={i} className="text-[10px] bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg font-bold">
                              #{i}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT CONTAINER: Chat box (Only rendered if chatOpen is true and connected) */}
          {chatOpen && isLoungeConnected && (
            <div className="lg:col-span-5 glass-card rounded-2xl p-4 flex flex-col justify-between items-stretch bg-white/[0.01]">
              <div className="flex-1 flex flex-col justify-between overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4 max-h-[350px]">
                  {chatLog.length === 0 && groupMessages.length === 0 && (
                    <div className="text-center py-12 text-gray-600 text-[10px]">
                      Encrypted session established. Messages are secure.
                    </div>
                  )}

                  {matchState === 'connected' && chatLog.map((msg, index) => {
                    const isMe = msg.senderId === 'me';
                    return (
                      <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${isMe ? 'bg-white text-black' : 'bg-white/5 text-gray-200 border border-white/5'}`}>
                          <p>{msg.text}</p>
                        </div>
                      </div>
                    );
                  })}

                  {matchState === 'group' && groupMessages.map((msg, index) => {
                    const isSystem = msg.senderId === 'system';
                    const isMe = msg.senderId === 'me';
                    if (isSystem) {
                      return <div key={index} className="text-center text-[9px] text-gray-600 py-1">{msg.text}</div>;
                    }
                    return (
                      <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${isMe ? 'bg-white text-black' : 'bg-white/5 text-gray-200 border border-white/5'}`}>
                          <p>{msg.text}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatBottomRef} />
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-xs rounded-xl glass-input"
                  />
                  <button type="submit" className="bg-white text-black p-2.5 rounded-xl transition flex items-center justify-center">
                    <Send size={14} />
                  </button>
                </form>
              </div>
            </div>
          )}

        </div>
      </div>

      

      {/* REPORT ABUSE MODAL */}
      {isReportOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 shadow-2xl relative border border-red-500/20">
            <button onClick={() => setIsReportOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 mb-4 text-red-400">
              <ShieldAlert size={20} />
              <h3 className="text-lg font-bold text-white">Report Opponent</h3>
            </div>
            
            <form onSubmit={handleReport} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Reason</label>
                <textarea
                  placeholder="Describe the violation..."
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  required
                  rows={4}
                  className="w-full p-3 text-xs rounded-xl glass-input"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Screenshot (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-white/5 file:text-white hover:file:bg-white/10"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReportOpen(false)}
                  className="px-4 py-2 border border-white/10 hover:bg-white/5 text-gray-400 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reporting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  {reporting ? <Loader2 size={13} className="animate-spin" /> : 'Submit & Skip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
