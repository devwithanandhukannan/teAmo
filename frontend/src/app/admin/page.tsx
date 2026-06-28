'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '../../context/SocketContext';
import { getBackendUrl, safeGetUserMedia } from '@/config';
import { useModal } from '../../context/ModalContext';
import { 
  ShieldAlert, Settings, BarChart2, ShieldAlert as ReportsIcon, Users as UsersIcon, 
  Key, Server, Sliders, Ban, CheckCircle, AlertTriangle, PlayCircle, Loader2,
  Menu, X, Activity, Clock, TrendingUp, LogOut, ArrowLeft, RefreshCw, Database,
  MessageSquare, Phone, Video, PhoneCall, PhoneOff, VolumeX, CameraOff, Shield, Search
} from 'lucide-react';

interface TopActiveUser {
  _id: string;
  username: string;
  email: string;
  avatarUrl: string;
  totalOnlineTime?: number;
}

interface Analytics {
  totalUsers: number;
  onlineUsers: number;
  offlineUsers: number;
  totalReports: number;
  totalGroups: number;
  liveThreshold: number;
  topActiveUsers?: TopActiveUser[];
}

interface UserRecord {
  _id: string;
  username: string;
  email: string;
  trustRank: number;
  reportsCount: number;
  isBanned: boolean;
  createdAt: string;
  totalOnlineTime?: number;
}

interface ReportRecord {
  _id: string;
  reporter: { username: string; email: string };
  reportedUser?: { _id: string; username: string; email: string; reportsCount: number; isBanned: boolean };
  reportedGroup?: { _id: string; name: string; members: string[] };
  reason: string;
  screenshotUrl?: string;
  createdAt: string;
}

const formatStayTime = (seconds?: number) => {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
};

export default function AdminPage() {
  const router = useRouter();
  const { showAlert, showConfirm } = useModal();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'analytics' | 'smtp' | 'reports' | 'users' | 'chat'>('analytics');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeReportDetails, setActiveReportDetails] = useState<any | null>(null);

  // Connection telemetry
  const [serverHealth, setServerHealth] = useState<'online' | 'checking' | 'error'>('checking');
  const [dbStatus, setDbStatus] = useState<'connected' | 'checking' | 'error'>('checking');

  // Form states
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpSecure, setSmtpSecure] = useState('false');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [threshold, setThreshold] = useState('1000');

  // Data logs
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);

  // Target Chat & Call states
  const { 
    socket, sendDirectMessage, directMessages, setDirectMessages
  } = useSocket();
  const [selectedTargetUser, setSelectedTargetUser] = useState<UserRecord | null>(null);
  const [typedMessage, setTypedMessage] = useState('');
  const [isMatched, setIsMatched] = useState(false);

  // Search filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // Custom Ban Modal states
  const [isBanModalOpen, setIsBanModalOpen] = useState(false);
  const [banTargetUserId, setBanTargetUserId] = useState('');
  const [banTargetUsername, setBanTargetUsername] = useState('');
  const [banReasonInput, setBanReasonInput] = useState('');
  
  // Direct Call states
  const [callState, setCallState] = useState<'idle' | 'calling' | 'incoming' | 'active'>('idle');
  const [callPartner, setCallPartner] = useState<{ _id: string; username: string; avatarUrl: string } | null>(null);
  const [incomingCallOffer, setIncomingCallOffer] = useState<any>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const localVideoRef = React.useRef<HTMLVideoElement>(null);
  const remoteVideoRef = React.useRef<HTMLVideoElement>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chatEndRef = React.useRef<HTMLDivElement>(null);

  // Interactive graph hover states
  const [hoveredSpike, setHoveredSpike] = useState<number | null>(null);
  const [hoveredDuration, setHoveredDuration] = useState<number | null>(null);

  const backendUrl = getBackendUrl();

  // Mock telemetry data representing login spikes
  const loginSpikeData = [
    { time: '00:00', count: 42, activeDuration: '18m avg' },
    { time: '04:00', count: 18, activeDuration: '14m avg' },
    { time: '08:00', count: 32, activeDuration: '12m avg' },
    { time: '12:00', count: 85, activeDuration: '24m avg' },
    { time: '16:00', count: 110, activeDuration: '32m avg' },
    { time: '20:00', count: 165, activeDuration: '48m avg' },
    { time: '24:00', count: 98, activeDuration: '30m avg' }
  ];

  // Session duration distribution data
  const stayDurationData = [
    { range: '<5m', pct: 15, count: 'Fast skips' },
    { range: '5-15m', pct: 28, count: 'Casual chat' },
    { range: '15-30m', pct: 35, count: 'Engaged users' },
    { range: '30-60m', pct: 15, count: 'Long calls' },
    { range: '1-2h+', pct: 7, count: 'Super hangouts' }
  ];

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    const userObj = JSON.parse(userStr);
    if (userObj.username !== 'admin') {
      setIsAdmin(false);
      setLoading(false);
    } else {
      setIsAdmin(true);
      setLoading(false);
      loadAnalytics();
      loadReports();
      loadUsers();
      checkBackendTelemetry();
    }
  }, []);

  // Load message logs when selectedTargetUser changes
  useEffect(() => {
    if (!selectedTargetUser) return;

    const loadMessageHistory = async () => {
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${backendUrl}/api/friends/messages/${selectedTargetUser._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          const formatted = data.messages.map((m: any) => ({
            senderId: m.sender.toString(),
            text: m.text,
            createdAt: new Date(m.createdAt)
          }));
          
          setDirectMessages(prev => ({
            ...prev,
            [selectedTargetUser._id]: formatted
          }));
        }
      } catch (err) {
        console.error('Error fetching chat history:', err);
      }
    };

    loadMessageHistory();
  }, [selectedTargetUser]);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [directMessages, selectedTargetUser]);

  // Socket call hooks for admin WebRTC
  useEffect(() => {
    if (!socket) return;

    socket.on('admin_new_report_alert', () => {
      loadReports();
    });

    socket.on('call_incoming', ({ fromUserId, caller, offer }) => {
      setCallPartner(caller);
      setIncomingCallOffer(offer);
      setCallState('incoming');
    });

    socket.on('call_accepted', async ({ answer }) => {
      const pc = pcRef.current as any;
      if (pc) {
        if (pc.signalingState !== 'have-local-offer' || pc._isSettingRemote) {
          console.warn('[Admin] Ignoring call_accepted due to state or setting:', pc.signalingState);
          return;
        }
        pc._isSettingRemote = true;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          setCallState('active');
        } finally {
          pc._isSettingRemote = false;
        }
      }
    });

    socket.on('call_rejected', async () => {
      closeCall();
      await showAlert('Call Declined', 'Call was declined by user.');
    });

    socket.on('call_ended', () => {
      closeCall();
    });

    socket.on('match_found', async ({ opponent: opp, isCaller }) => {
      try {
        setCallPartner(opp);
        setCallState('active');

        if (isCaller) {
          try {
            const stream = await safeGetUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            setLocalStream(stream);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            const pc = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            pcRef.current = pc;

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            pc.ontrack = (event) => {
              if (remoteVideoRef.current && event.streams[0]) {
                remoteVideoRef.current.srcObject = event.streams[0];
              }
            };

            pc.onicecandidate = (event) => {
              if (event.candidate) {
                socket.emit('signal', { signalData: { candidate: event.candidate } });
              }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('signal', { signalData: { offer } });
          } catch (err: any) {
            console.error('Video stream error:', err);
            if (err.message === 'SECURE_CONTEXT_REQUIRED') {
              await showAlert('Secure Context Required', '🔒 Camera/mic access requires HTTPS or localhost connection.');
            } else {
              await showAlert('Stream Error', 'Could not start video stream. Operating in text mode.');
            }
          }
        } else {
          // If not caller, just prepare RTCPeerConnection to receive offer
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });
          pcRef.current = pc;

          pc.ontrack = (event) => {
            if (remoteVideoRef.current && event.streams[0]) {
              remoteVideoRef.current.srcObject = event.streams[0];
            }
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('signal', { signalData: { candidate: event.candidate } });
            }
          };
        }
      } catch (err) {
        console.error('match_found event error:', err);
      }
    });

    socket.on('match_message', ({ senderId, text }) => {
      setDirectMessages(prev => ({
        ...prev,
        [senderId]: [...(prev[senderId] || []), {
          senderId,
          text,
          createdAt: new Date()
        }]
      }));
    });

    socket.on('match_skipped', () => {
      closeCall();
    });

    socket.on('signal', async ({ signalData }) => {
      const pc = pcRef.current;
      const pcAny = pc as any;
      if (!pc) return;
      try {
        if (signalData.offer) {
          try {
            const stream = await safeGetUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            setLocalStream(stream);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            
            if (pc.signalingState !== 'stable' || pcAny._isSettingRemote) {
              console.warn('[Admin] Ignoring offer due to state:', pc.signalingState);
              return;
            }
            pcAny._isSettingRemote = true;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(signalData.offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('signal', { signalData: { answer } });
              setCallState('active');
            } finally {
              pcAny._isSettingRemote = false;
            }
          } catch (err: any) {
            console.error('Signal video stream error:', err);
            if (err.message === 'SECURE_CONTEXT_REQUIRED') {
              await showAlert('Secure Context Required', '🔒 Camera/mic access requires HTTPS or localhost connection.');
            } else {
              await showAlert('Stream Error', 'Could not start video stream. Operating in text mode.');
            }
          }
        } else if (signalData.answer) {
          if (pc.signalingState !== 'have-local-offer' || pcAny._isSettingRemote) {
            console.warn('[Admin] Ignoring answer due to state:', pc.signalingState);
            return;
          }
          pcAny._isSettingRemote = true;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signalData.answer));
            setCallState('active');
          } finally {
            pcAny._isSettingRemote = false;
          }
        } else if (signalData.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
        }
      } catch (err) {
        console.error('Admin WebRTC signal error:', err);
      }
    });

    return () => {
      socket.off('call_incoming');
      socket.off('call_accepted');
      socket.off('call_rejected');
      socket.off('call_ended');
      socket.off('match_found');
      socket.off('match_message');
      socket.off('match_skipped');
      socket.off('signal');
      socket.off('admin_new_report_alert');
    };
  }, [socket]);

  const startCasualMatch = async (userRec: UserRecord, mode: 'video' | 'text' = 'video') => {
    if (!socket) return;
    const token = localStorage.getItem('token');
    setSelectedTargetUser(userRec);
    setActiveTab('chat');

    try {
      const res = await fetch(`${backendUrl}/api/admin/force-match/${userRec._id}?mode=${mode}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) {
        await showAlert('Match Error', data.message || 'Failed to establish casual match.');
      } else {
        setIsMatched(true);
      }
    } catch (err) {
      console.error(err);
      await showAlert('Match Error', 'Network error while establishing casual match.');
    }
  };

  const acceptIncomingCall = async () => {
    if (!socket || !callPartner || !incomingCallOffer) return;

    try {
      const stream = await safeGetUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setLocalStream(stream);

      setCallState('active');

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('signal', { signalData: { candidate: event.candidate } });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCallOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('accept_call', { toUserId: callPartner._id, answer });

      setTimeout(() => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }, 500);

    } catch (error: any) {
      console.error(error);
      if (error.message === 'SECURE_CONTEXT_REQUIRED') {
        await showAlert('Secure Context Required', '🔒 Camera/mic access requires HTTPS or localhost connection.');
      } else {
        await showAlert('Call Failed', 'Call failed. Check camera/mic permissions.');
      }
      rejectIncomingCall();
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setLocalStream(null);
    setCallPartner(null);
    setIncomingCallOffer(null);
    setCallState('idle');
  };

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

  const handleSendDM = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedMessage.trim() || !selectedTargetUser) return;
    sendDirectMessage(selectedTargetUser._id, typedMessage);
    setTypedMessage(typedMessage);
    setTypedMessage('');
  };

  const checkBackendTelemetry = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/health`, { method: 'GET' }).catch(() => null);
      if (res && res.ok) {
        setServerHealth('online');
        setDbStatus('connected');
      } else {
        setServerHealth('error');
        setDbStatus('error');
      }
    } catch {
      setServerHealth('error');
      setDbStatus('error');
    }
  };

  const loadAnalytics = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/admin/analytics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setAnalytics(data.analytics);
        setThreshold(data.analytics.liveThreshold.toString());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadReports = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/admin/reports`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setReports(data.reports);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadUsers = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadSmtpSettings = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/admin/smtp`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.config) {
        setSmtpHost(data.config.host || '');
        setSmtpPort(data.config.port?.toString() || '');
        setSmtpUser(data.config.user || '');
        setSmtpSecure(data.config.secure?.toString() || 'false');
        setSmtpFrom(data.config.from || '');
        setSmtpFromName(data.config.fromName || '');
        setSmtpHasPassword(!!data.config.hasPassword);
        setSmtpPass('');
      }
    } catch (err) {
      console.error('Error loading SMTP settings:', err);
    }
  };

  const handleTestSmtp = async () => {
    setTestLoading(true);
    setTestResult(null);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/admin/smtp/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          password: smtpPass,
          secure: smtpSecure === 'true',
          from: smtpFrom,
          fromName: smtpFromName
        })
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message || 'SMTP connection failed.'
      });
    } catch (err: any) {
      console.error(err);
      setTestResult({
        success: false,
        message: err.message || 'Network error occurred while testing SMTP.'
      });
    } finally {
      setTestLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'smtp') {
      loadSmtpSettings();
      setTestResult(null);
    }
  }, [activeTab]);

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/admin/smtp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          password: smtpPass,
          secure: smtpSecure === 'true',
          from: smtpFrom,
          fromName: smtpFromName
        })
      });
      const data = await res.json();
      if (data.success) {
        await showAlert('Settings Saved', 'SMTP configurations saved successfully.');
        setSmtpPass('');
        // Reload settings to update password saved confirmation status
        loadSmtpSettings();
      } else {
        await showAlert('Settings Error', data.message || 'Failed to save settings.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSaveThreshold = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/admin/threshold`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ threshold: parseInt(threshold, 10) })
      });
      const data = await res.json();
      if (data.success) {
        await showAlert('Threshold Updated', 'Global Live capacity threshold updated.');
        loadAnalytics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openBanModal = (id: string, username: string) => {
    setBanTargetUserId(id);
    setBanTargetUsername(username);
    setBanReasonInput('');
    setIsBanModalOpen(true);
  };

  const submitBan = async () => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${backendUrl}/api/admin/ban/${banTargetUserId}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ reason: banReasonInput })
      });
      const data = await res.json();
      if (data.success) {
        setIsBanModalOpen(false);
        loadUsers();
        loadReports();
        loadAnalytics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnbanUser = async (id: string) => {
    const token = localStorage.getItem('token');
    const confirmed = await showConfirm('Unban User', 'Are you sure you want to unban this user?', 'Unban', 'Cancel');
    if (!confirmed) return;
    try {
      const res = await fetch(`${backendUrl}/api/admin/unban/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        loadUsers();
        loadReports();
        loadAnalytics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBanGroup = async (groupId: string) => {
    const token = localStorage.getItem('token');
    const confirmed = await showConfirm('Ban Group', 'Banning this group will ban ALL members of the group. Proceed?', 'Ban Group', 'Cancel');
    if (!confirmed) return;
    try {
      const res = await fetch(`${backendUrl}/api/admin/ban-group/${groupId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        await showAlert('Group Banned', 'Group and all member accounts have been banned.');
        loadUsers();
        loadReports();
        loadAnalytics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#000000]">
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#000000] text-center px-4">
        <div className="max-w-md glass-card rounded-3xl p-8 border border-red-500/20">
          <ShieldAlert className="text-red-500 mx-auto mb-4" size={48} />
          <h2 className="text-xl font-black text-white uppercase tracking-widest">Access Denied</h2>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            You do not possess the required administrator credentials to enter this portal.
          </p>
          <button 
            onClick={() => router.push('/login')}
            className="mt-6 px-5 py-2.5 bg-white text-black text-xs font-bold rounded-xl hover:bg-gray-200 transition"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000000] text-white flex overflow-hidden font-sans">
      
      {/* 1. Left Collapsible Sidebar */}
      <aside 
        className={`fixed top-0 left-0 h-full z-40 bg-black/90 backdrop-blur-xl border-r border-white/10 transition-all duration-300 flex flex-col justify-between ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div>
          {/* Logo Section */}
          <div className="h-16 flex items-center px-6 border-b border-white/5 gap-3">
            <div className="p-2 bg-white/10 border border-white/10 rounded-xl text-white">
              <ShieldAlert size={20} />
            </div>
            {sidebarOpen && (
              <div className="flex flex-col">
                <span className="text-xs font-black tracking-widest uppercase text-white leading-none">
                  HANGOUT
                </span>
                <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-0.5 leading-none">
                  ADMIN CONSOLE
                </span>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'analytics' 
                  ? 'bg-white text-black font-black' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <BarChart2 size={16} />
              {sidebarOpen && <span>Activity Telemetry</span>}
            </button>

            <button
              onClick={() => setActiveTab('smtp')}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'smtp' 
                  ? 'bg-white text-black font-black' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Server size={16} />
              {sidebarOpen && <span>SMTP Server</span>}
            </button>

            <button
              onClick={() => setActiveTab('reports')}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'reports' 
                  ? 'bg-white text-black font-black' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <ReportsIcon size={16} />
              {sidebarOpen && <span>Abuse Reports</span>}
            </button>

            <button
              onClick={() => setActiveTab('users')}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'users' 
                  ? 'bg-white text-black font-black' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <UsersIcon size={16} />
              {sidebarOpen && <span>Users Registry</span>}
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl text-xs font-bold transition-all duration-200 ${
                activeTab === 'chat' 
                  ? 'bg-white text-black font-black' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <MessageSquare size={16} />
              {sidebarOpen && <span>Chat & Calls</span>}
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-white/5 space-y-2">
          <button
            onClick={() => router.push('/match')}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-gray-500 hover:text-white transition"
          >
            <ArrowLeft size={15} />
            {sidebarOpen && <span>Exit Dashboard</span>}
          </button>
        </div>
      </aside>

      {/* 2. Main Page Layout Container */}
      <div 
        className="flex-1 flex flex-col min-h-screen bg-black transition-all duration-300"
        style={{ paddingLeft: sidebarOpen ? '260px' : '80px' }}
      >
        
        {/* Topbar Navigation Header */}
        <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between sticky top-0 bg-black/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition"
              title="Toggle Sidebar"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <h1 className="text-sm font-black uppercase tracking-wider text-white">
              {activeTab === 'analytics' && 'Activity Telemetry'}
              {activeTab === 'smtp' && 'SMTP Server Setup'}
              {activeTab === 'reports' && 'Abuse & Spam Logs'}
              {activeTab === 'users' && 'Accounts Directory'}
              {activeTab === 'chat' && 'Target Chat & Calls'}
            </h1>
          </div>

          {/* Telemetry Status Lights */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-5 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
              {/* Server health check */}
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${serverHealth === 'online' ? 'bg-green-500 animate-pulse' : serverHealth === 'checking' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
                <span>Server: {serverHealth}</span>
              </div>
              {/* Database status check */}
              <div className="flex items-center gap-1.5">
                <Database size={12} className={dbStatus === 'connected' ? 'text-green-500' : 'text-red-500'} />
                <span>DB: {dbStatus}</span>
              </div>
            </div>

            <button 
              onClick={() => {
                loadAnalytics();
                loadReports();
                loadUsers();
                checkBackendTelemetry();
              }}
              className="p-2 hover:bg-white/5 rounded-xl text-gray-400 hover:text-white transition"
              title="Reload Dashboard"
            >
              <RefreshCw size={16} />
            </button>

            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-white/5 rounded-xl text-red-500 hover:text-red-400 transition flex items-center gap-1.5 text-xs font-bold border border-red-500/10 hover:border-red-500/20 bg-red-500/5 px-3 py-1.5 rounded-xl"
              title="Logout Account"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-6xl w-full mx-auto">
          
          {/* Tab 1: Telemetry Metrics */}
          {activeTab === 'analytics' && analytics && (
            <div className="space-y-6">
              
              {/* Analytics Header Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-card rounded-2xl p-5 border border-white/5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Total Users</span>
                  <span className="text-2xl font-black text-white mt-1 block tracking-tight">{analytics.totalUsers}</span>
                </div>
                <div className="glass-card rounded-2xl p-5 border border-white/5">
                  <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest block flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-ping"></span> Live Sockets
                  </span>
                  <span className="text-2xl font-black text-white mt-1 block tracking-tight">{analytics.onlineUsers}</span>
                </div>
                <div className="glass-card rounded-2xl p-5 border border-white/5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Offline Users</span>
                  <span className="text-2xl font-black text-white mt-1 block tracking-tight">{analytics.offlineUsers}</span>
                </div>
                <div className="glass-card rounded-2xl p-5 border border-red-500/10">
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block">Abuse Reports</span>
                  <span className="text-2xl font-black text-white mt-1 block tracking-tight">{analytics.totalReports}</span>
                </div>
              </div>

              {/* Data Graphs Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Graph 1: Hourly Login Spikes SVG */}
                <div className="glass-card rounded-3xl p-6 border border-white/5 flex flex-col justify-between min-h-[320px]">
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <TrendingUp size={14} className="text-gray-400" /> Hourly Login Spikes
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-1">Real-time hourly active socket login peaks throughout the day.</p>
                  </div>

                  {/* SVG Chart */}
                  <div className="relative mt-4 flex-1 flex items-end">
                    <svg viewBox="0 0 500 160" className="w-full h-full overflow-visible">
                      <defs>
                        <linearGradient id="spikeGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>

                      {/* Grid Lines */}
                      <line x1="0" y1="40" x2="500" y2="40" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                      <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                      {/* Area Path */}
                      <path 
                        d="M 10 140 Q 80 120 150 90 T 290 50 T 430 30 L 490 60 L 490 140 Z" 
                        fill="url(#spikeGrad)" 
                      />

                      {/* Line Path */}
                      <path 
                        d="M 10 140 Q 80 120 150 90 T 290 50 T 430 30 L 490 60" 
                        fill="none" 
                        stroke="#ffffff" 
                        strokeWidth="2.5" 
                        strokeLinecap="round"
                      />

                      {/* Interactive nodes */}
                      {loginSpikeData.map((d, index) => {
                        // Calculate standard point distributions
                        const x = 10 + (index * 80);
                        // Map count to y coordinates
                        const y = 140 - (d.count * 0.7);

                        return (
                          <g key={index} className="cursor-pointer">
                            <circle 
                              cx={x} 
                              cy={y} 
                              r={hoveredSpike === index ? 6 : 4} 
                              fill={hoveredSpike === index ? '#ffffff' : '#000000'} 
                              stroke="#ffffff" 
                              strokeWidth="2.5"
                              onMouseEnter={() => setHoveredSpike(index)}
                              onMouseLeave={() => setHoveredSpike(null)}
                              className="transition-all duration-150"
                            />
                            {/* Hover label indicator */}
                            {hoveredSpike === index && (
                              <g>
                                <rect 
                                  x={x - 45} 
                                  y={y - 45} 
                                  width="90" 
                                  height="35" 
                                  rx="8" 
                                  fill="#111111" 
                                  stroke="rgba(255,255,255,0.15)" 
                                  strokeWidth="1"
                                />
                                <text x={x} y={y - 32} fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                                  {d.count} Online
                                </text>
                                <text x={x} y={y - 20} fill="#888888" fontSize="8" textAnchor="middle">
                                  {d.activeDuration}
                                </text>
                              </g>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Graph Labels */}
                  <div className="flex justify-between text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-2 border-t border-white/5 pt-2">
                    {loginSpikeData.map((d, idx) => (
                      <span key={idx}>{d.time}</span>
                    ))}
                  </div>
                </div>

                {/* Graph 2: Stay Duration Custom SVG Bar Chart */}
                <div className="glass-card rounded-3xl p-6 border border-white/5 flex flex-col justify-between min-h-[320px]">
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <Clock size={14} className="text-gray-400" /> Session stay duration
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-1">Average user connection length per matchmaking session.</p>
                  </div>

                  {/* SVG Bar Chart */}
                  <div className="relative mt-6 flex-1 flex items-end justify-around">
                    {stayDurationData.map((d, idx) => {
                      const barHeight = d.pct * 3.5; // Scale height
                      return (
                        <div 
                          key={idx} 
                          className="flex flex-col items-center gap-2 group relative cursor-pointer"
                          onMouseEnter={() => setHoveredDuration(idx)}
                          onMouseLeave={() => setHoveredDuration(null)}
                        >
                          {/* Tooltip */}
                          {hoveredDuration === idx && (
                            <div className="absolute -top-12 bg-black border border-white/10 px-3 py-1.5 rounded-xl text-center shadow-2xl z-20 w-28">
                              <p className="text-[9px] font-bold text-white leading-none">{d.pct}% of users</p>
                              <p className="text-[8px] text-gray-500 mt-0.5 leading-none">{d.count}</p>
                            </div>
                          )}

                          {/* Bar Fill */}
                          <div 
                            style={{ height: `${barHeight}px` }} 
                            className={`w-10 rounded-t-xl transition-all duration-300 ${
                              hoveredDuration === idx ? 'bg-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-white/15'
                            }`}
                          ></div>

                          {/* Range Label */}
                          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">{d.range}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total telemetric baseline */}
                  <div className="mt-4 border-t border-white/5 pt-2 text-center">
                    <span className="text-[9px] font-bold text-gray-400">Weighted Average Duration: <strong className="text-white">28.4 Minutes</strong></span>
                  </div>
                </div>

              </div>

              {/* Bottom row grid: limit controller & stay leaderboard */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                {/* Threshold throttle controller */}
                <div className="glass-card rounded-2xl p-6 border border-white/5">
                  <h3 className="text-xs font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Sliders size={15} className="text-gray-400" /> Live Limit Throttle
                  </h3>
                  <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
                    Configure maximum capacity of users that can match simultaneously before subsequent matches are routed to temporary Lounges.
                  </p>
                  <div className="flex gap-3 items-center">
                    <input
                      type="number"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className="w-full max-w-[120px] px-3.5 py-2 text-xs rounded-xl glass-input font-bold"
                    />
                    <button
                      onClick={handleSaveThreshold}
                      className="px-4 py-2 bg-white text-black hover:bg-gray-200 rounded-xl text-xs font-black transition"
                    >
                      Save Limit
                    </button>
                  </div>
                </div>

                {/* User Stay Leaderboard */}
                <div className="glass-card rounded-2xl p-6 border border-white/5 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest mb-2 flex items-center gap-2">
                      <Clock size={15} className="text-indigo-400" /> Top Engaged Users
                    </h3>
                    <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
                      Leaderboard of regular matched users who spent the longest time online.
                    </p>
                  </div>
                  <div className="space-y-2.5">
                    {analytics.topActiveUsers && analytics.topActiveUsers.length > 0 ? (
                      analytics.topActiveUsers.map((user, index) => (
                        <div key={user._id} className="flex items-center justify-between bg-white/[0.01] border border-white/5 p-2.5 rounded-xl">
                          <div className="flex items-center gap-2.5">
                            <span className="text-[10px] font-bold text-gray-500">#{index + 1}</span>
                            <img src={user.avatarUrl} alt="Avatar" className="h-6 w-6 rounded-full bg-gray-900 border border-white/10" />
                            <span className="text-xs font-bold text-gray-200">{user.username}</span>
                          </div>
                          <span className="text-[10px] font-bold text-indigo-400 font-mono">{formatStayTime(user.totalOnlineTime)}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-[10px] text-gray-600 font-bold block py-4 text-center">No active users stay records yet.</span>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Tab 2: SMTP Settings Setup */}
          {activeTab === 'smtp' && (
            <div className="glass-card rounded-3xl p-8 max-w-3xl border border-white/5 flex flex-col gap-5 text-white">
              <div>
                <span className="text-[10px] tracking-widest font-black text-indigo-400 uppercase block">Email Service</span>
                <h2 className="text-xl font-black text-white mt-1 uppercase tracking-tight">SMTP Server Setup</h2>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Gmail SMTP for owner invites and notifications (use a Google App Password, not your account password)
                </p>
              </div>

              <div className="flex justify-start border-b border-white/5 pb-5">
                <button
                  type="button"
                  disabled={testLoading || saveLoading}
                  onClick={handleTestSmtp}
                  className="px-5 py-2.5 border border-white/10 hover:bg-white/5 text-gray-300 rounded-xl text-xs font-black transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {testLoading ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />} Test SMTP
                </button>
              </div>

              <form onSubmit={handleSaveSmtp} className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Host */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Host</label>
                  <input
                    type="text"
                    placeholder="smtp.gmail.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    required
                    className="py-2.5 px-4 text-xs rounded-xl border border-white/5 bg-white/[0.02] text-white focus:outline-none focus:border-indigo-500/50 transition font-bold glass-input"
                  />
                </div>

                {/* Port */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Port</label>
                  <input
                    type="number"
                    placeholder="587"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    required
                    className="py-2.5 px-4 text-xs rounded-xl border border-white/5 bg-white/[0.02] text-white focus:outline-none focus:border-indigo-500/50 transition font-bold glass-input"
                  />
                </div>

                {/* SMTP user */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SMTP user</label>
                  <input
                    type="text"
                    placeholder="info.gfence@gmail.com"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    required
                    className="py-2.5 px-4 text-xs rounded-xl border border-white/5 bg-white/[0.02] text-white focus:outline-none focus:border-indigo-500/50 transition font-bold glass-input"
                  />
                </div>

                {/* From email */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">From email</label>
                  <input
                    type="email"
                    placeholder="info.gfence@gmail.com"
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    required
                    className="py-2.5 px-4 text-xs rounded-xl border border-white/5 bg-white/[0.02] text-white focus:outline-none focus:border-indigo-500/50 transition font-bold glass-input"
                  />
                </div>

                {/* From name */}
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">From name</label>
                  <input
                    type="text"
                    placeholder="G-Fence"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    className="w-full py-2.5 px-4 text-xs rounded-xl border border-white/5 bg-white/[0.02] text-white focus:outline-none focus:border-indigo-500/50 transition font-bold glass-input"
                  />
                </div>

                {/* SMTP password */}
                <div className="sm:col-span-2 flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">SMTP password</label>
                  <input
                    type="password"
                    placeholder={smtpHasPassword ? "Saved — enter only to replace" : "Enter SMTP password"}
                    value={smtpPass}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    className="w-full py-2.5 px-4 text-xs rounded-xl border border-white/5 bg-white/[0.02] text-white focus:outline-none focus:border-indigo-500/50 transition font-bold glass-input"
                  />
                  <span className="text-[9px] text-gray-500 font-semibold mt-0.5">
                    Password is stored. Enter a new value only to replace it, then Save.
                  </span>
                  {smtpHasPassword && (
                    <span className="text-[9px] text-indigo-400 font-bold mt-1 block">
                      SMTP password is saved on the server.
                    </span>
                  )}
                </div>

                {testResult && (
                  <div className={`sm:col-span-2 p-4 rounded-xl flex items-start gap-3 border ${
                    testResult.success 
                      ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    {testResult.success ? (
                      <CheckCircle size={16} className="mt-0.5 shrink-0 text-green-400" />
                    ) : (
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
                    )}
                    <div className="text-xs">
                      <p className="font-bold text-white uppercase tracking-wider">{testResult.success ? 'SMTP Configuration Valid' : 'SMTP Configuration Invalid'}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-relaxed">{testResult.message}</p>
                    </div>
                  </div>
                )}

                <div className="sm:col-span-2 flex justify-end gap-3 pt-4 border-t border-white/5 mt-2">
                  <button
                    type="submit"
                    disabled={saveLoading || testLoading}
                    className="px-6 py-3 bg-white hover:bg-gray-200 text-black rounded-xl text-xs font-black transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {saveLoading ? <Loader2 size={13} className="animate-spin" /> : <Key size={13} />} Save Credentials
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab 3: Spam Reports Logs */}
          {activeTab === 'reports' && (
            <div className="glass-card rounded-3xl p-6 border border-white/5 overflow-hidden">
              <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4">Abuse Reports Log</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                      <th className="py-3 px-4">Reporter</th>
                      <th className="py-3 px-4">Target (Type)</th>
                      <th className="py-3 px-4">Reason Description</th>
                      <th className="py-3 px-4">Evidence</th>
                      <th className="py-3 px-4">Report Count</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => (
                      <tr key={report._id} className="border-b border-white/5/60 text-xs text-gray-300 hover:bg-white/5 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white">{report.reporter.username}</div>
                          <div className="text-[9px] text-gray-500">{report.reporter.email}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          {report.reportedUser ? (
                            <>
                              <div className="font-bold text-white">{report.reportedUser.username}</div>
                              <div className="text-[9px] text-amber-500 uppercase tracking-wider font-bold">User Account</div>
                            </>
                          ) : report.reportedGroup ? (
                            <>
                              <div className="font-bold text-white">{report.reportedGroup.name}</div>
                              <div className="text-[9px] text-emerald-500 uppercase tracking-wider font-bold">Group Lounge</div>
                            </>
                          ) : (
                            <span className="text-gray-500">Unknown</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs truncate font-bold text-gray-400" title={report.reason}>
                          {report.reason}
                        </td>
                        <td className="py-3.5 px-4">
                          {report.screenshotUrl ? (
                            <a
                              href={`${backendUrl}${report.screenshotUrl}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline text-white hover:text-gray-300 font-bold text-[10px]"
                            >
                              View Screen
                            </a>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {report.reportedUser ? (
                            <div className="flex flex-col gap-1">
                              <span className="font-bold">{report.reportedUser.reportsCount}/5 reports</span>
                              <span>
                                {report.reportedUser.isBanned ? (
                                  <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest uppercase">Banned</span>
                                ) : (
                                  <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest uppercase">Active</span>
                                )}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {report.reportedUser && (
                            <div className="flex gap-1.5 justify-end">
                              <button
                                onClick={() => setActiveReportDetails(report)}
                                className="px-3 py-1.5 bg-secondary hover:bg-accent border border-border text-foreground rounded-xl font-black text-[9px] tracking-wider uppercase transition flex items-center gap-1 cursor-pointer"
                              >
                                <Sliders size={10} /> Details
                              </button>
                              <button
                                onClick={() => {
                                  const userRecord: UserRecord = {
                                    _id: report.reportedUser!._id,
                                    username: report.reportedUser!.username,
                                    email: report.reportedUser!.email,
                                    trustRank: 100,
                                    reportsCount: report.reportedUser!.reportsCount,
                                    isBanned: report.reportedUser!.isBanned,
                                    createdAt: new Date().toISOString()
                                  };
                                  setSelectedTargetUser(userRecord);
                                  setActiveTab('chat');
                                }}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[9px] tracking-wider uppercase tracking-wider transition flex items-center gap-1 cursor-pointer"
                              >
                                <MessageSquare size={10} /> Chat & Call
                              </button>
                              <button
                                onClick={() => report.reportedUser!.isBanned ? handleUnbanUser(report.reportedUser!._id) : openBanModal(report.reportedUser!._id, report.reportedUser!.username)}
                                className={`px-3 py-1.5 rounded-xl font-black text-[9px] tracking-wider uppercase transition ${
                                  report.reportedUser!.isBanned 
                                    ? 'bg-green-500 text-black hover:bg-green-400' 
                                    : 'bg-white/10 hover:bg-red-600 hover:text-white text-white border border-white/5'
                                }`}
                              >
                                {report.reportedUser!.isBanned ? 'Unban' : 'Ban User'}
                              </button>
                            </div>
                          )}
                          {report.reportedGroup && (
                            <button
                              onClick={() => handleBanGroup(report.reportedGroup!._id)}
                              className="px-3 py-1.5 bg-white/10 hover:bg-red-600 hover:text-white text-white border border-white/5 rounded-xl font-black text-[9px] tracking-wider uppercase transition"
                            >
                              Ban Group
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {reports.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-gray-500 text-xs font-bold">
                          No abuse reports submitted yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 4: Users Administration */}
          {activeTab === 'users' && (
            <div className="glass-card rounded-3xl p-6 border border-white/5 overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black text-white uppercase tracking-widest">Accounts Directory</h3>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="px-4 py-2 text-xs rounded-xl glass-input w-64 bg-white/[0.03] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                      <th className="py-3 px-4">Username</th>
                      <th className="py-3 px-4">Email Address</th>
                      <th className="py-3 px-4">Trust Rank</th>
                      <th className="py-3 px-4">Spam Count</th>
                      <th className="py-3 px-4">Stay Time</th>
                      <th className="py-3 px-4">Joined Date</th>
                      <th className="py-3 px-4 text-right">Moderation Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()) || u.email.toLowerCase().includes(searchQuery.toLowerCase())).map((user) => (
                      <tr key={user._id} className="border-b border-white/5/60 text-xs text-gray-300 hover:bg-white/5 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white">{user.username}</td>
                        <td className="py-3.5 px-4 font-semibold text-gray-400">{user.email}</td>
                        <td className="py-3.5 px-4 font-black">
                          <span className="text-white">{user.trustRank}%</span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-red-400">{user.reportsCount}</td>
                        <td className="py-3.5 px-4 text-indigo-400 font-bold">{formatStayTime(user.totalOnlineTime)}</td>
                        <td className="py-3.5 px-4 text-gray-500 font-bold">{new Date(user.createdAt).toLocaleDateString()}</td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex gap-1.5 justify-end">
                            <button
                              onClick={() => startCasualMatch(user, 'video')}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[9px] tracking-wider uppercase transition flex items-center gap-1"
                            >
                              <MessageSquare size={10} /> Connect
                            </button>
                            <button
                              onClick={() => user.isBanned ? handleUnbanUser(user._id) : openBanModal(user._id, user.username)}
                              className={`px-3 py-1.5 rounded-xl font-black text-[9px] tracking-wider uppercase transition ${
                                user.isBanned 
                                  ? 'bg-green-500 text-black hover:bg-green-400' 
                                  : 'bg-white/10 hover:bg-red-600 hover:text-white text-white border border-white/5'
                              }`}
                            >
                              {user.isBanned ? 'Unban User' : 'Ban User'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-gray-500 text-xs font-bold">
                          No users registered in directory.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 5: Target Chat & Calls */}
          {activeTab === 'chat' && (
            <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch min-h-[500px]">
              {/* Left Column: Registered Users list to select */}
              <div className="lg:col-span-4 glass-card rounded-3xl p-4 flex flex-col bg-white/[0.01]">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Select User to Connect</h3>
                <input
                  type="text"
                  placeholder="Search by name or email..."
                  value={chatSearchQuery}
                  onChange={(e) => setChatSearchQuery(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl w-full mb-3 bg-white/[0.03] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-white/20 transition"
                />
                <div className="space-y-2 overflow-y-auto max-h-[400px] flex-1">
                  {users.filter(u => u.username.toLowerCase().includes(chatSearchQuery.toLowerCase()) || u.email.toLowerCase().includes(chatSearchQuery.toLowerCase())).map((u) => (
                    <div
                      key={u._id}
                      onClick={() => setSelectedTargetUser(u)}
                      className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition ${
                        selectedTargetUser?._id === u._id
                          ? 'bg-white/10 border-white/10'
                          : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${u.username}`}
                          alt={u.username}
                          className="h-8 w-8 rounded-full border border-white/5 bg-gray-900"
                        />
                        <div>
                          <h4 className="text-xs font-bold text-white">{u.username}</h4>
                          <span className="text-[9px] text-gray-500 block truncate max-w-[150px]">{u.email}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <div className="text-center py-12 text-gray-600 text-xs font-bold">No users in directory.</div>
                  )}
                </div>
              </div>

              {/* Right Column: Chat Box & Call Controls */}
              <div className="lg:col-span-8 flex flex-col gap-6 items-stretch">
                {selectedTargetUser ? (
                  <div className="glass-card rounded-3xl p-5 flex flex-col justify-between flex-1 min-h-[480px] bg-white/[0.01]">
                    <div className="flex justify-between items-center border-b border-white/5 pb-3.5 mb-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selectedTargetUser.username}`}
                          alt={selectedTargetUser.username}
                          className="h-9 w-9 rounded-full border border-white/5 bg-gray-900"
                        />
                        <div>
                          <h3 className="text-xs font-black text-white">{selectedTargetUser.username}</h3>
                          <span className="text-[9px] text-gray-500">{selectedTargetUser.email}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => startCasualMatch(selectedTargetUser, 'video')}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs transition flex items-center gap-1.5"
                          title="Start Video Session"
                        >
                          <Video size={14} /> Video
                        </button>
                        <button
                          onClick={() => startCasualMatch(selectedTargetUser, 'text')}
                          className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl font-bold text-xs transition flex items-center gap-1.5"
                          title="Start Text Session"
                        >
                          <MessageSquare size={14} /> Text
                        </button>
                        <button
                          onClick={() => setSelectedTargetUser(null)}
                          className="text-gray-400 hover:text-white transition p-2"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Chat messages */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4 max-h-[300px]">
                      {(!directMessages[selectedTargetUser._id] || directMessages[selectedTargetUser._id].length === 0) && (
                        <div className="text-center py-16 text-gray-600 text-[10px] font-bold">
                          No messages yet. Send a direct message to this user!
                        </div>
                      )}
                      {(directMessages[selectedTargetUser._id] || []).map((msg, index) => {
                        const isMe = msg.senderId === 'me' || msg.senderId === socket?.id;
                        return (
                          <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-xs ${isMe ? 'bg-white text-black font-semibold' : 'bg-white/5 text-gray-200 border border-white/5'}`}>
                              <p>{msg.text}</p>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={chatEndRef} />
                    </div>

                    {/* Send form */}
                    <form onSubmit={handleSendDM} className="flex gap-2">
                      <input
                        type="text"
                        placeholder={`Message ${selectedTargetUser.username}...`}
                        value={typedMessage}
                        onChange={(e) => setTypedMessage(e.target.value)}
                        className="flex-1 px-4 py-3.5 text-xs rounded-xl glass-input"
                      />
                      <button 
                        type="submit" 
                        disabled={!typedMessage.trim()} 
                        className="bg-white text-black px-5 rounded-xl font-black text-xs transition hover:bg-gray-200 disabled:opacity-50 disabled:hover:bg-white"
                      >
                        Send
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="glass-card rounded-3xl p-6 flex flex-col justify-center items-center flex-1 min-h-[480px] bg-white/[0.01] text-center">
                    <MessageSquare size={36} className="text-gray-600 mb-4 animate-pulse" />
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">No Active Connection</h3>
                    <p className="text-[10px] text-gray-500 mt-1 max-w-xs leading-relaxed">
                      Select a user from the directory to start an encrypted text discussion or launch a peer WebRTC video connection.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* DIRECT CALL OVERLAY */}
      {callState !== 'idle' && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-gray-950/50 rounded-3xl overflow-hidden border border-white/5 flex flex-col aspect-[4/3] relative">
            
            {/* Incoming call screen */}
            {callState === 'incoming' && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 text-center p-6">
                <img src={callPartner?.avatarUrl} alt="Avatar" className="h-20 w-20 rounded-full border-2 border-white animate-pulse mb-4 bg-gray-900" />
                <h3 className="text-lg font-bold text-white uppercase">{callPartner?.username}</h3>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1"><PhoneCall size={12} className="animate-bounce" /> Incoming target call...</p>
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
                <p className="text-xs text-gray-500 mt-1">Waiting for user to accept call</p>
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
                <span className="absolute bottom-3 left-3 bg-black/75 px-3 py-1 rounded text-xs font-bold border border-white/5">You (Admin)</span>
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


      {/* BAN USER MODAL */}
      {isBanModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="glass-card rounded-3xl p-8 border border-white/10 w-full max-w-md mx-4 animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <Shield size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Ban User</h3>
                <p className="text-[10px] text-gray-500">@{banTargetUsername}</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 block">
                Reason <span className="text-gray-600">(optional)</span>
              </label>
              <textarea
                value={banReasonInput}
                onChange={(e) => setBanReasonInput(e.target.value)}
                placeholder="Enter reason for banning..."
                rows={3}
                className="w-full px-4 py-3 text-xs rounded-xl bg-white/[0.03] border border-white/10 text-white placeholder-gray-600 focus:outline-none focus:border-red-500/30 transition resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsBanModalOpen(false)}
                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-xs transition border border-white/5"
              >
                Cancel
              </button>
              <button
                onClick={submitBan}
                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs transition"
              >
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}
      {activeReportDetails && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl glass-card rounded-2xl p-6 shadow-2xl relative border border-white/10 max-h-[85vh] overflow-y-auto">
            <button 
              onClick={() => setActiveReportDetails(null)} 
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 mb-6 text-red-400">
              <ShieldAlert size={22} />
              <h3 className="text-base font-black text-foreground uppercase tracking-wider">Incident Report Details</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-xs">
              <div className="bg-secondary/40 p-4 rounded-xl border border-border">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Reporter</span>
                <p className="font-bold text-foreground">{activeReportDetails.reporter?.username || 'System'}</p>
                <p className="text-[10px] text-muted-foreground">{activeReportDetails.reporter?.email}</p>
                <p className="text-[10px] text-muted-foreground font-semibold mt-2">IP Address: {activeReportDetails.reporterIp || activeReportDetails.reporter?.lastIp || 'N/A'}</p>
              </div>
              <div className="bg-secondary/40 p-4 rounded-xl border border-border">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Reported User</span>
                <p className="font-bold text-foreground">{activeReportDetails.reportedUser?.username || 'Stranger'}</p>
                <p className="text-[10px] text-muted-foreground">{activeReportDetails.reportedUser?.email}</p>
                <p className="text-[10px] text-muted-foreground font-semibold mt-2">IP Address: {activeReportDetails.reportedUserIp || activeReportDetails.reportedUser?.lastIp || 'N/A'}</p>
              </div>
            </div>

            <div className="mb-6">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Violation Reason</span>
              <div className="bg-secondary/20 p-4 rounded-xl border border-border text-xs text-foreground font-medium">
                {activeReportDetails.reason}
              </div>
            </div>

            {activeReportDetails.screenshotUrl && (
              <div className="mb-6">
                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Screenshot Evidence</span>
                <div className="border border-border rounded-xl overflow-hidden max-h-[250px] flex items-center justify-center bg-black/40">
                  <img
                    src={`${backendUrl}${activeReportDetails.screenshotUrl}`}
                    alt="Screenshot evidence"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              </div>
            )}

            <div className="mb-6">
              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2">Chat History Logs (Redis Session Cache)</span>
              <div className="bg-black/40 border border-border rounded-xl p-4 max-h-[250px] overflow-y-auto space-y-3">
                {activeReportDetails.chatLog && activeReportDetails.chatLog.length > 0 ? (
                  activeReportDetails.chatLog.map((msg: any, idx: number) => {
                    const isReporter = msg.senderId === activeReportDetails.reporter?._id;
                    return (
                      <div key={idx} className="flex flex-col text-xs">
                        <span className={`text-[8.5px] font-bold ${isReporter ? 'text-blue-400' : 'text-amber-500'}`}>
                          {msg.senderUsername || (isReporter ? activeReportDetails.reporter?.username : activeReportDetails.reportedUser?.username || 'Stranger')}
                        </span>
                        <span className="text-gray-300 bg-secondary/30 px-3 py-1.5 rounded-lg inline-block max-w-[90%] mt-0.5">
                          {msg.text}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-6">No chat log recorded for this session.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-4 mt-6">
              <button
                type="button"
                onClick={() => setActiveReportDetails(null)}
                className="px-4 py-2 border border-border hover:bg-secondary text-muted-foreground rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close
              </button>
              {activeReportDetails.reportedUser && (
                <button
                  type="button"
                  onClick={() => {
                    const isBanned = activeReportDetails.reportedUser.isBanned;
                    const uid = activeReportDetails.reportedUser._id;
                    const uname = activeReportDetails.reportedUser.username;
                    setActiveReportDetails(null);
                    if (isBanned) {
                      handleUnbanUser(uid);
                    } else {
                      openBanModal(uid, uname);
                    }
                  }}
                  className={`px-5 py-2 rounded-xl text-xs font-black transition cursor-pointer shadow-lg ${
                    activeReportDetails.reportedUser.isBanned
                      ? 'bg-green-500 text-black hover:bg-green-400'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {activeReportDetails.reportedUser.isBanned ? 'Unban User' : 'Ban User'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
