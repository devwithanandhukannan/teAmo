'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../components/Toast';
import { getBackendUrl, safeGetUserMedia } from '@/config';
import { 
  Phone, Video, Send, Plus, Trash2, X, Loader2, 
  PhoneCall, PhoneOff, VolumeX, CameraOff, Bell, BellOff, MessageSquare
} from 'lucide-react';

interface Friend {
  _id: string;
  username: string;
  avatarUrl: string;
  trustRank: number;
  isOnline: boolean;
}

interface Snap {
  _id: string;
  imageUrl: string;
  sender: {
    _id: string;
    username: string;
    avatarUrl: string;
  };
  createdAt: string;
}

interface DBMessage {
  sender: string;
  recipient: string;
  text: string;
  createdAt: string;
}

export default function FriendsPage() {
  const router = useRouter();
  const { 
    socket, friends, fetchFriends, 
    notifications, fetchNotifications, clearAllNotifications,
    sendDirectMessage, directMessages, setDirectMessages
  } = useSocket();
  const { showToast } = useToast();

  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [typedMessage, setTypedMessage] = useState('');
  
  // Snaps feed
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loadingSnaps, setLoadingSnaps] = useState(false);
  const [activeStory, setActiveStory] = useState<Snap | null>(null);
  const [snapUploadOpen, setSnapUploadOpen] = useState(false);
  const [snapFile, setSnapFile] = useState<File | null>(null);
  const [uploadingSnap, setUploadingSnap] = useState(false);

  // Direct Call
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'active'>('idle');
  const [callPartner, setCallPartner] = useState<{ _id: string; username: string; avatarUrl: string } | null>(null);
  const [incomingCallOffer, setIncomingCallOffer] = useState<any>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [callConnected, setCallConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingCallSignalsRef = useRef<any[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef(socket);
  const callPartnerRef = useRef(callPartner);

  // Keep refs in sync
  useEffect(() => { socketRef.current = socket; }, [socket]);
  useEffect(() => { callPartnerRef.current = callPartner; }, [callPartner]);

  const backendUrl = getBackendUrl();

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
    
    fetchFriends();
    fetchNotifications();
    loadSnapsFeed();

    // If the user accepted an incoming call from another page (via global modal),
    // the call offer was stored in localStorage — pick it up and auto-answer it
    const pendingCallStr = localStorage.getItem('pendingIncomingCall');
    if (pendingCallStr) {
      try {
        const pendingCall = JSON.parse(pendingCallStr);
        localStorage.removeItem('pendingIncomingCall');
        setCallPartner(pendingCall.caller);
        setIncomingCallOffer(pendingCall.offer);
        setCallState('incoming');
      } catch (e) {
        localStorage.removeItem('pendingIncomingCall');
      }
    }
  }, []);

  // Sync state changes with Dock
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('match-status-changed', {
      detail: { 
        state: callState === 'active' ? 'connected' : 'idle', 
        mode: 'video', 
        isDirect: true 
      }
    }));
  }, [callState]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('call-controls-updated', {
      detail: { audioMuted: isMuted, videoMuted: isCamOff, chatOpen: false }
    }));
  }, [isMuted, isCamOff]);

  // Dock listeners — use refs to avoid stale closures
  useEffect(() => {
    const handleDockMuteAudio = () => {
      if (streamRef.current) {
        const track = streamRef.current.getAudioTracks()[0];
        if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
      }
    };
    const handleDockMuteVideo = () => {
      if (streamRef.current) {
        const track = streamRef.current.getVideoTracks()[0];
        if (track) { track.enabled = !track.enabled; setIsCamOff(!track.enabled); }
      }
    };
    const handleDockExit = () => {
      const s = socketRef.current;
      const p = callPartnerRef.current;
      if (s && p) s.emit('end_call', { toUserId: p._id });
      closeCall();
    };

    window.addEventListener('dock-mute-audio', handleDockMuteAudio);
    window.addEventListener('dock-mute-video', handleDockMuteVideo);
    window.addEventListener('dock-exit', handleDockExit);

    return () => {
      window.removeEventListener('dock-mute-audio', handleDockMuteAudio);
      window.removeEventListener('dock-mute-video', handleDockMuteVideo);
      window.removeEventListener('dock-exit', handleDockExit);
    };
  }, []); // Empty — safe because we use refs

  const handleUnfriend = async (friendId: string) => {
    if (!window.confirm("Are you sure you want to unfriend/unfollow this user?")) return;

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${backendUrl}/api/friends/remove/${friendId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        showToast('Friend removed.');
        setSelectedFriend(null);
        fetchFriends();
      } else {
        showToast(data.message || 'Failed to remove friend.');
      }
    } catch (err) {
      console.error(err);
      showToast('Error removing friend.');
    }
  };

  // WhatsApp-style message logs retrieval on friend selection
  useEffect(() => {
    if (!selectedFriend) return;

    const loadMessageHistory = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${backendUrl}/api/friends/messages/${selectedFriend._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          // Format DBMessage fields to fit the Message state format used in context
          const formatted = data.messages.map((m: any) => ({
            senderId: m.sender.toString(),
            text: m.text,
            createdAt: new Date(m.createdAt)
          }));
          
          setDirectMessages(prev => ({
            ...prev,
            [selectedFriend._id]: formatted
          }));
        }
      } catch (err) {
        console.error('Error fetching chat history:', err);
      }
    };

    loadMessageHistory();
  }, [selectedFriend]);

  const loadSnapsFeed = async () => {
    setLoadingSnaps(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/snaps`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setSnaps(data.snaps);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSnaps(false);
    }
  };

  const handleUploadSnap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapFile) return;

    setUploadingSnap(true);
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('image', snapFile);

    try {
      const res = await fetch(`${backendUrl}/api/snaps`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast('Snap shared successfully.');
        setSnapUploadOpen(false);
        setSnapFile(null);
        loadSnapsFeed();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploadingSnap(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [directMessages, selectedFriend]);

  useEffect(() => {
    if (!socket) return;

    // Note: call_incoming is now handled globally in SocketContext
    // This page only handles call state changes once the call is active

    socket.on('call_accepted', async ({ answer }) => {
      const pc = pcRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState('active');
        setCallConnected(false);
        await processPendingCallSignals(pc);
      }
    });

    socket.on('call_rejected', () => {
      closeCall();
      showToast('Call was declined by friend.');
    });

    socket.on('call_ended', () => {
      closeCall();
    });

    socket.on('signal', async ({ signalData }) => {
      const pc = pcRef.current;
      // Queue ALL signal types when PC not ready
      if (!pc) {
        pendingCallSignalsRef.current.push(signalData);
        return;
      }
      if (!pc.remoteDescription && (signalData.candidate || signalData.answer)) {
        pendingCallSignalsRef.current.push(signalData);
        return;
      }
      if (signalData.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        } catch (err) {
          console.error(err);
        }
      }
    });

    return () => {
      socket.off('call_incoming');
      socket.off('call_accepted');
      socket.off('call_rejected');
      socket.off('call_ended');
      socket.off('signal');
    };
  }, [socket]);

  const processPendingCallSignals = async (pc: RTCPeerConnection) => {
    while (pendingCallSignalsRef.current.length > 0) {
      const signalData = pendingCallSignalsRef.current.shift();
      if (signalData.candidate) {
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
          } else {
            pendingCallSignalsRef.current.push(signalData);
            break;
          }
        } catch (err) {
          console.error('Error processing queued call signal:', err);
        }
      }
    }
  };

  const createPeerConnection = (s: any) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // TURN relay — required for same-machine/same-network connections
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turns:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10
    });

    // Pre-build a remote stream for track-by-track browsers
    const remoteStream = new MediaStream();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

    // Set handlers BEFORE assigning to ref
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      } else {
        remoteStream.addTrack(event.track);
      }
      setCallConnected(true);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && s) {
        s.emit('signal', { signalData: { candidate: event.candidate } });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[ICE direct] iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallConnected(true);
      }
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC direct] connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') setCallConnected(true);
      if (pc.connectionState === 'failed') pc.restartIce();
    };

    return pc;
  };


  const startCall = async (friend: Friend) => {
    if (!socket) return;
    setCallPartner(friend);
    setCallConnected(false);
    setCallState('calling');

    try {
      const stream = await safeGetUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;
      setLocalStream(stream);
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = createPeerConnection(socket);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      pcRef.current = pc;

      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socket.emit('call_user', { toUserId: friend._id, offer });

    } catch (error: any) {
      console.error(error);
      closeCall();
      if (error.message === 'SECURE_CONTEXT_REQUIRED') {
        showToast('🔒 Camera/mic access requires HTTPS or localhost connection.');
      } else {
        showToast('Call failed. Check camera/mic permissions.');
      }
    }
  };

  const acceptIncomingCall = async () => {
    if (!socket || !callPartner || !incomingCallOffer) return;

    try {
      const stream = await safeGetUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      streamRef.current = stream;
      setLocalStream(stream);
      setCallConnected(false);
      setCallState('active');

      const pc = createPeerConnection(socket);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Set remote description BEFORE assigning to ref
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCallOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Assign ref only after remote desc is set
      pcRef.current = pc;

      socket.emit('accept_call', { toUserId: callPartner._id, answer });

      // Drain queued candidates
      await processPendingCallSignals(pc);

      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    } catch (error: any) {
      console.error(error);
      closeCall();
      if (error.message === 'SECURE_CONTEXT_REQUIRED') {
        showToast('🔒 Camera/mic access requires HTTPS or localhost connection.');
      } else {
        showToast('Call failed. Check camera/mic permissions.');
      }
    }
  };

  const rejectIncomingCall = () => {
    if (socket && callPartner) {
      socket.emit('reject_call', { toUserId: callPartner._id });
    }
    closeCall();
  };

  const endActiveCall = () => {
    if (socket && callPartner) {
      socket.emit('end_call', { toUserId: callPartner._id });
    }
    closeCall();
  };

  const closeCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingCallSignalsRef.current = [];
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setLocalStream(null);
    setCallConnected(false);
    setCallPartner(null);
    setIncomingCallOffer(null);
    setCallState('idle');
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
  };

  const handleSendDM = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || !selectedFriend) return;
    sendDirectMessage(selectedFriend._id, typedMessage);
    setTypedMessage('');
  };

  useEffect(() => {
    if (activeStory) {
      const timer = setTimeout(() => {
        setActiveStory(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeStory]);

  const toggleMute = () => {
    if (streamRef.current) {
      const track = streamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsCamOff(!track.enabled);
      }
    }
  };

  const currentChatMsgs = selectedFriend ? (directMessages[selectedFriend._id] || []) : [];

  return (
    <div className="min-h-screen pt-32 pb-36 px-4 flex flex-col items-center bg-[#000000] relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/5 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-1">
        
        {/* LEFT PANEL: Stories & Contacts */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Stories */}
          <div className="glass-card rounded-2xl p-4 flex flex-col bg-white/[0.01]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Stories (24h Snaps)</span>
              <button 
                onClick={() => setSnapUploadOpen(true)}
                className="p-1 bg-white/5 text-gray-300 hover:text-white rounded-lg border border-white/5 transition"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="flex gap-3 overflow-x-auto py-1">
              {snaps.map((snap) => (
                <button
                  key={snap._id}
                  onClick={() => setActiveStory(snap)}
                  className="flex flex-col items-center gap-1.5 focus:outline-none shrink-0"
                >
                  <div className="h-12 w-12 rounded-full p-[2px] bg-white border border-white/10">
                    <img
                      src={snap.sender.avatarUrl}
                      alt="Avatar"
                      className="h-full w-full rounded-full border border-black bg-gray-900 object-cover"
                    />
                  </div>
                  <span className="text-[9px] text-gray-400 max-w-[50px] truncate font-bold">
                    {snap.sender.username}
                  </span>
                </button>
              ))}
              {snaps.length === 0 && !loadingSnaps && (
                <span className="text-[10px] text-gray-600 py-3">No active stories shared.</span>
              )}
            </div>
          </div>

          {/* Friends List */}
          <div className="glass-card rounded-2xl p-4 flex-1 flex flex-col bg-white/[0.01]">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Friends List</h3>
            <div className="space-y-2 overflow-y-auto flex-1 max-h-[300px]">
              {friends.map((friend) => (
                <div
                  key={friend._id}
                  onClick={() => setSelectedFriend(friend)}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                    selectedFriend?._id === friend._id
                      ? 'bg-white/10 border-white/10'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={friend.avatarUrl}
                      alt={friend.username}
                      className="h-9 w-9 rounded-full border border-white/5 bg-gray-900"
                    />
                    <div>
                      <h4 className="text-xs font-bold text-white">{friend.username}</h4>
                      <span className="text-[9px] text-gray-500 block">Trust index: {friend.trustRank}%</span>
                    </div>
                  </div>

                  {/* GREEN TICK FOR ONLINE, RED CROSS FOR OFFLINE */}
                  <div className="flex items-center gap-2">
                    {friend.isOnline ? (
                      <span className="h-4.5 w-4.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full flex items-center justify-center text-[10px] font-black" title="Online">
                        ✓
                      </span>
                    ) : (
                      <span className="h-4.5 w-4.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full flex items-center justify-center text-[10px] font-black" title="Offline">
                        ×
                      </span>
                    )}

                    {friend.isOnline && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startCall(friend);
                        }}
                        className="p-1.5 bg-white/5 hover:bg-white hover:text-black rounded-lg border border-white/5 transition"
                        title="Voice Call"
                      >
                        <Phone size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {friends.length === 0 && (
                <div className="text-center py-12 text-gray-600 text-xs">No permanent friends yet.</div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Messaging / System Notifications */}
        <div className="lg:col-span-8 flex flex-col gap-6 items-stretch">
          {selectedFriend ? (
            <div className="glass-card rounded-2xl p-4 flex flex-col justify-between flex-1 min-h-[450px] bg-white/[0.01]">
              <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-4">
                <div className="flex items-center gap-3">
                  <img
                    src={selectedFriend.avatarUrl}
                    alt={selectedFriend.username}
                    className="h-8 w-8 rounded-full border border-white/5 bg-gray-900"
                  />
                  <div>
                    <h3 className="text-xs font-bold text-white">{selectedFriend.username}</h3>
                    <span className="text-[9px] text-gray-500">{selectedFriend.isOnline ? 'Active Now' : 'Offline'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUnfriend(selectedFriend._id)}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 rounded-lg text-xs transition"
                    title="Unfriend / Unfollow"
                  >
                    <Trash2 size={12} />
                  </button>
                  <button onClick={() => setSelectedFriend(null)} className="text-gray-400 hover:text-white transition p-1 hover:bg-white/5 rounded-lg">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4 max-h-[300px]">
                {currentChatMsgs.length === 0 && (
                  <div className="text-center py-12 text-gray-600 text-[10px]">
                    Encrypted history. Say hi to your friend!
                  </div>
                )}
                {currentChatMsgs.map((msg, index) => {
                  const isMe = msg.senderId === 'me' || msg.senderId === socket?.id;
                  return (
                    <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] rounded-xl px-3.5 py-2 text-xs ${isMe ? 'bg-white text-black' : 'bg-white/5 text-gray-200 border border-white/5'}`}>
                        <p>{msg.text}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendDM} className="flex gap-2">
                <input
                  type="text"
                  placeholder={`Send direct message...`}
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  className="flex-1 px-4 py-3 text-xs rounded-xl glass-input"
                />
                <button type="submit" disabled={!typedMessage.trim()} className="bg-white text-black px-4 rounded-xl font-bold text-xs transition">
                  Send
                </button>
              </form>
            </div>
          ) : (
            <div className="glass-card rounded-2xl p-6 flex flex-col justify-between flex-1 min-h-[450px] bg-white/[0.01]">
              <div>
                <div className="flex justify-between items-center border-b border-white/5 pb-3 mb-6">
                  <div className="flex items-center gap-2 text-white">
                    <Bell size={16} />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">System Logs</h3>
                  </div>
                  {notifications.length > 0 && (
                    <button onClick={clearAllNotifications} className="text-[10px] text-gray-500 hover:text-red-400 font-bold transition">
                      Clear Logs
                    </button>
                  )}
                </div>

                <div className="space-y-2 overflow-y-auto max-h-[300px]">
                  {notifications.map((notif) => (
                    <div key={notif._id} className="flex items-start justify-between bg-white/[0.02] p-3.5 border border-white/5 rounded-xl">
                      <p className="text-xs text-gray-400">{notif.message}</p>
                      <span className="text-[9px] text-gray-600 block pl-2 shrink-0">{new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                  {notifications.length === 0 && (
                    <div className="text-center py-20 text-gray-600 text-xs flex flex-col items-center gap-2">
                      <BellOff size={28} />
                      <span>Inbox is completely clear.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Snap Lightbox */}
      {activeStory && (
        <div onClick={() => setActiveStory(null)} className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4 cursor-pointer">
          <div className="relative w-full max-w-lg aspect-[9/16] bg-black rounded-2xl overflow-hidden border border-white/5">
            <div className="absolute top-4 left-4 right-4 h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full animate-[loading-bar_5s_linear_forwards]" style={{ width: '100%' }}></div>
            </div>
            <div className="absolute top-8 left-4 flex items-center gap-2 z-10">
              <img src={activeStory.sender.avatarUrl} alt="Avatar" className="h-8 w-8 rounded-full border border-white/10 bg-gray-900" />
              <span className="text-xs font-bold text-white">{activeStory.sender.username}</span>
            </div>
            <img src={`${backendUrl}${activeStory.imageUrl}`} alt="Snap" className="w-full h-full object-contain" />
          </div>
        </div>
      )}

      {/* Snap Upload Modal */}
      {snapUploadOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 shadow-2xl relative border border-white/5">
            <button onClick={() => setSnapUploadOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white transition">
              <X size={18} />
            </button>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-4">Post 24h Snap</h3>
            <form onSubmit={handleUploadSnap} className="space-y-4">
              <input
                type="file"
                accept="image/*"
                required
                onChange={(e) => setSnapFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-white/5 file:text-white"
              />
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSnapUploadOpen(false)} className="px-4 py-2 border border-white/10 hover:bg-white/5 text-gray-400 rounded-xl text-xs font-bold transition">Cancel</button>
                <button type="submit" disabled={uploadingSnap} className="px-4 py-2 bg-white text-black rounded-xl text-xs font-bold transition flex items-center gap-1.5">
                  {uploadingSnap ? <Loader2 size={13} className="animate-spin" /> : 'Post Snap'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIRECT CALL OVERLAY */}
      {callState !== 'idle' && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-gray-950/50 rounded-3xl overflow-hidden border border-white/5 flex flex-col aspect-[4/3] relative">
            
            {/* Incoming call screen */}
            {callState === 'incoming' && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 text-center p-6">
                <img src={callPartner?.avatarUrl} alt="Avatar" className="h-20 w-20 rounded-full border-2 border-white animate-pulse mb-4 bg-gray-900" />
                <h3 className="text-lg font-bold text-white uppercase">{callPartner?.username}</h3>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><PhoneCall size={12} className="animate-bounce" /> Incoming direct call...</p>
                <div className="flex gap-4 mt-8">
                  <button onClick={rejectIncomingCall} className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs transition flex items-center gap-1">
                    <PhoneOff size={14} /> Decline
                  </button>
                  <button onClick={acceptIncomingCall} className="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-xs transition flex items-center gap-1">
                    <Phone size={14} /> Accept
                  </button>
                </div>
              </div>
            )}

            {/* Outgoing call screen */}
            {callState === 'calling' && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 text-center p-6">
                <img src={callPartner?.avatarUrl} alt="Avatar" className="h-20 w-20 rounded-full border-2 border-white animate-pulse mb-4 bg-gray-900" />
                <h3 className="text-lg font-bold text-white uppercase">Calling {callPartner?.username}...</h3>
                <p className="text-xs text-gray-500 mt-1">Waiting for friend to accept call</p>
                <button onClick={endActiveCall} className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs transition flex items-center gap-1 mt-8">
                  <PhoneOff size={14} /> End Request
                </button>
              </div>
            )}

            {/* HORIZONTAL VIDEO CALL TILES */}
            <div className="flex-1 flex flex-col md:flex-row bg-black gap-2 p-4 items-stretch relative min-h-[300px]">
              {/* Remote Frame */}
              <div className="flex-1 bg-gray-900 rounded-2xl overflow-hidden border border-white/5 flex items-center justify-center relative">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <span className="absolute bottom-3 left-3 bg-black/75 px-3 py-1 rounded text-xs font-bold border border-white/5">{callPartner?.username}</span>
              </div>

              {/* Local Frame */}
              <div className="flex-1 bg-gray-900 rounded-2xl overflow-hidden border border-white/5 flex items-center justify-center relative">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <span className="absolute bottom-3 left-3 bg-black/75 px-3 py-1 rounded text-xs font-bold border border-white/5">You</span>
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <button onClick={toggleMute} className={`p-2 rounded-lg transition ${isMuted ? 'bg-red-500 text-white' : 'bg-black/60 hover:bg-black text-gray-300'}`}><VolumeX size={13} /></button>
                  <button onClick={toggleCam} className={`p-2 rounded-lg transition ${isCamOff ? 'bg-red-500 text-white' : 'bg-black/60 hover:bg-black text-gray-300'}`}><CameraOff size={13} /></button>
                </div>
              </div>
            </div>

            {callState === 'active' && (
              <div className="bg-gray-900/60 p-4 border-t border-white/5 flex justify-center items-center gap-4 z-10">
                <button onClick={endActiveCall} className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs transition flex items-center gap-1"><PhoneOff size={14} /> End Call</button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
