'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Heart, UserPlus, Bell, X, Check, Phone, PhoneOff, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getBackendUrl } from '@/config';
import { useModal } from './ModalContext';

interface UserInfo {
  _id: string;
  username: string;
  avatarUrl: string;
  trustRank?: number;
}

interface Message {
  senderId: string;
  text: string;
  createdAt: Date;
}

interface Friend {
  _id: string;
  username: string;
  avatarUrl: string;
  trustRank: number;
  isOnline: boolean;
}

interface Notification {
  _id: string;
  type: string;
  message: string;
  createdAt: Date;
  sender?: UserInfo;
}

interface GroupInfo {
  _id: string;
  name: string;
  members: UserInfo[];
}

interface IncomingCall {
  fromUserId: string;
  caller: { _id: string; username: string; avatarUrl: string };
  offer: RTCSessionDescriptionInit;
}

// Rich toast notification
interface RichToast {
  id: string;
  type: 'friend_request' | 'friend_accept' | 'nearby_connect' | 'generic';
  message: string;
  sender?: UserInfo;
}

interface SocketContextProps {
  socket: Socket | null;
  onlineCount: number;
  friends: Friend[];
  notifications: Notification[];
  activeGroup: GroupInfo | null;
  groupMessages: Message[];
  setFriends: React.Dispatch<React.SetStateAction<Friend[]>>;
  fetchFriends: () => Promise<void>;
  fetchNotifications: () => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  sendDirectMessage: (toUserId: string, text: string) => void;
  directMessages: { [key: string]: Message[] };
  setDirectMessages: React.Dispatch<React.SetStateAction<{ [key: string]: Message[] }>>;
  // Global incoming call state — read by friends/page
  incomingCall: IncomingCall | null;
  setIncomingCall: React.Dispatch<React.SetStateAction<IncomingCall | null>>;
  pendingSignals: any[];
  setPendingSignals: React.Dispatch<React.SetStateAction<any[]>>;
}

const SocketContext = createContext<SocketContextProps | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showAlert } = useModal();
  const router = useRouter();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupInfo | null>(null);
  const [groupMessages, setGroupMessages] = useState<Message[]>([]);
  const [directMessages, setDirectMessages] = useState<{ [key: string]: Message[] }>({});
  const [incomingRequest, setIncomingRequest] = useState<UserInfo | null>(null);
  const [richToasts, setRichToasts] = useState<RichToast[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [pendingSignals, setPendingSignals] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const backendUrl = getBackendUrl();

  const showRichToast = useCallback((toast: Omit<RichToast, 'id'>) => {
    const id = Date.now().toString();
    setRichToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setRichToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }, []);

  const dismissRichToast = (id: string) => {
    setRichToasts(prev => prev.filter(t => t.id !== id));
  };

  const fetchFriends = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${backendUrl}/api/friends/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) { localStorage.clear(); window.location.href = '/login'; return; }
      const data = await res.json();
      if (data.success) setFriends(data.friends);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  }, [backendUrl]);

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${backendUrl}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) { localStorage.clear(); window.location.href = '/login'; return; }
      const data = await res.json();
      if (data.success) setNotifications(data.notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [backendUrl]);

  const clearAllNotifications = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${backendUrl}/api/notifications`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) { localStorage.clear(); window.location.href = '/login'; return; }
      const data = await res.json();
      if (data.success) setNotifications([]);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }, [backendUrl]);

  const sendDirectMessage = useCallback((toUserId: string, text: string) => {
    const s = socketRef.current;
    if (!s) return;
    s.emit('direct_message', { toUserId, text });
    const newMessage: Message = { senderId: 'me', text, createdAt: new Date() };
    setDirectMessages(prev => ({
      ...prev,
      [toUserId]: [...(prev[toUserId] || []), newMessage]
    }));
  }, []);

  const handleNearbyResponse = useCallback((accepted: boolean) => {
    const s = socketRef.current;
    setIncomingRequest(prev => {
      if (!prev) return null;
      if (s) s.emit('nearby_response', { fromUserId: prev._id, accepted });
      if (accepted) {
        setTimeout(async () => {
          await fetchFriends();
          await fetchNotifications();
        }, 500);
      }
      return null;
    });
  }, [fetchFriends, fetchNotifications]);

  // Accept incoming call — navigate to friends page with call state
  const acceptIncomingCallGlobal = useCallback((call: IncomingCall) => {
    // Store call offer so friends/page.tsx can pick it up
    localStorage.setItem('pendingIncomingCall', JSON.stringify({
      fromUserId: call.fromUserId,
      caller: call.caller,
      offer: call.offer,
      autoAccept: true
    }));
    setIncomingCall(null);
    router.push('/friends');
  }, [router]);

  const rejectIncomingCallGlobal = useCallback((call: IncomingCall) => {
    const s = socketRef.current;
    if (s) s.emit('reject_call', { toUserId: call.fromUserId });
    setIncomingCall(null);
  }, []);

  // Follow back (accept friend request) from notification
  const handleFollowBack = useCallback(async (senderId: string) => {
    const token = localStorage.getItem('token');
    if (!token || !senderId) return;
    try {
      const res = await fetch(`${backendUrl}/api/friends/follow/${senderId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        await fetchFriends();
        showRichToast({
          type: 'friend_accept',
          message: data.isMatch ? "🎉 You're now friends!" : '👋 Follow request sent back!'
        });
      }
    } catch (err) {
      console.error('Follow back error:', err);
    }
  }, [backendUrl, fetchFriends, showRichToast]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) return;
    const user = JSON.parse(userStr);

    const newSocket = io(backendUrl, {
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionAttempts: 20
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      newSocket.emit('authenticate', { token, userId: user._id });
      setSocket(newSocket);
      socketRef.current = newSocket;
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    newSocket.on('force_match_redirect', ({ mode }) => {
      router.push(`/match?mode=${mode || 'video'}`);
    });

    newSocket.on('online_metrics', ({ count }) => {
      setOnlineCount(count);
    });

    newSocket.on('friend_online', ({ userId }) => {
      setFriends(prev => {
        const friend = prev.find(f => f._id === userId);
        if (friend && !friend.isOnline) {
          // Defer the dispatch so it doesn't run synchronously during the React render phase
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('show-system-notification', {
              detail: { type: 'success', message: `${friend.username} came online!` }
            }));
          }, 0);
        }
        return prev.map(f => f._id === userId ? { ...f, isOnline: true } : f);
      });
      fetchNotifications();
    });

    newSocket.on('friend_offline', ({ userId }) => {
      setFriends(prev => prev.map(f => f._id === userId ? { ...f, isOnline: false } : f));
    });

    newSocket.on('direct_message', ({ senderId, text, createdAt }) => {
      const newMessage: Message = { senderId, text, createdAt: new Date(createdAt) };
      setDirectMessages(prev => ({
        ...prev,
        [senderId]: [...(prev[senderId] || []), newMessage]
      }));
    });

    newSocket.on('joined_group', ({ group }) => {
      setActiveGroup(group);
      setGroupMessages([]);
    });

    newSocket.on('group_user_joined', ({ user }) => {
      setActiveGroup(prev => {
        if (!prev) return null;
        if (prev.members.some(m => m._id === user._id)) return prev;
        return { ...prev, members: [...prev.members, user] };
      });
      const systemMessage: Message = {
        senderId: 'system',
        text: `${user.username} entered the lounge.`,
        createdAt: new Date()
      };
      setGroupMessages(prev => [...prev, systemMessage]);
    });

    newSocket.on('group_message', ({ senderId, username, text, createdAt }) => {
      const newMessage: Message = {
        senderId,
        text: `${username}: ${text}`,
        createdAt: new Date(createdAt)
      };
      setGroupMessages(prev => [...prev, newMessage]);
    });

    newSocket.on('signal', ({ signalData }) => {
      setPendingSignals(prev => [...prev, signalData]);
    });

    newSocket.on('banned', async () => {
      await showAlert('Account Banned', 'Your account has been banned by the Administrator.');
      localStorage.clear();
      window.location.href = '/login';
    });

    // Global: incoming friend call — works from ANY page
    newSocket.on('call_incoming', ({ fromUserId, caller, offer }) => {
      setIncomingCall({ fromUserId, caller, offer });
    });

    // If the friend call was ended before user answered
    newSocket.on('call_ended', () => {
      setIncomingCall(prev => prev || null); // dismiss if shown
      setIncomingCall(null);
    });

    // Real-time notification toast
    newSocket.on('new_notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      showRichToast({
        type: notification.type as any,
        message: notification.message,
        sender: notification.sender
      });
      window.dispatchEvent(new CustomEvent('show-system-notification', { detail: notification }));
    });

    // Nearby connect requests
    newSocket.on('nearby_request_received', ({ fromUser }) => {
      setIncomingRequest(fromUser);
    });

    newSocket.on('nearby_request_cancelled', ({ fromUserId }) => {
      setIncomingRequest(prev => (prev && prev._id === fromUserId ? null : prev));
    });

    fetchFriends();
    fetchNotifications();

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [backendUrl, fetchFriends, fetchNotifications, showAlert, showRichToast, router]);

  const getToastIcon = (type: string) => {
    switch (type) {
      case 'friend_accept': return <Heart size={18} className="text-pink-400 shrink-0" />;
      case 'friend_request': return <UserPlus size={18} className="text-indigo-400 shrink-0" />;
      default: return <Bell size={18} className="text-amber-400 shrink-0" />;
    }
  };

  const getToastTitle = (type: string) => {
    switch (type) {
      case 'friend_accept': return '🎉 Matched!';
      case 'friend_request': return '👋 Follow Request';
      default: return '🔔 Notification';
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        onlineCount,
        friends,
        notifications,
        activeGroup,
        groupMessages,
        setFriends,
        fetchFriends,
        fetchNotifications,
        clearAllNotifications,
        sendDirectMessage,
        directMessages,
        setDirectMessages,
        incomingCall,
        setIncomingCall,
        pendingSignals,
        setPendingSignals
      }}
    >
      {children}

      {/* ─── Global Incoming Call Modal ────────────────────────────── */}
      {incomingCall && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
          {/* Blurred backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-auto" />
          
          <div className="relative pointer-events-auto bg-[#050505]/95 border border-indigo-500/40 backdrop-blur-2xl rounded-3xl p-6 w-[90%] max-w-sm shadow-2xl z-10">
            {/* Pulse ring */}
            <div className="absolute inset-0 rounded-3xl border border-indigo-500/20 animate-ping pointer-events-none" />
            
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="relative">
                <img
                  src={incomingCall.caller.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=caller'}
                  alt="Caller"
                  className="h-20 w-20 rounded-full border-2 border-indigo-500/60 object-cover bg-gray-900"
                />
                <div className="absolute -bottom-1 -right-1 bg-indigo-600 rounded-full p-1.5">
                  <Video size={14} className="text-white" />
                </div>
              </div>

              <div>
                <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">
                  📹 Incoming Video Call
                </p>
                <h3 className="text-xl font-black text-white mt-1">
                  {incomingCall.caller.username}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">wants to video call you</p>
              </div>

              <div className="flex gap-4 w-full mt-2">
                <button
                  onClick={() => rejectIncomingCallGlobal(incomingCall)}
                  className="flex-1 py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-black text-[10px] uppercase tracking-wider rounded-2xl transition flex items-center justify-center gap-2"
                >
                  <PhoneOff size={16} /> Decline
                </button>
                <button
                  onClick={() => acceptIncomingCallGlobal(incomingCall)}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-wider rounded-2xl transition flex items-center justify-center gap-2"
                >
                  <Phone size={16} /> Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Rich Socket Notification Toasts ──────────────────────── */}
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-3 w-[90%] max-w-xs pointer-events-none">
        {richToasts.map(toast => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-neutral-950/95 border border-white/10 backdrop-blur-2xl rounded-2xl p-4 flex flex-col gap-3 shadow-2xl"
            style={{ animation: 'slideInFromRight 0.35s ease-out' }}
          >
            <div className="flex items-start gap-3">
              {toast.sender ? (
                <img
                  src={toast.sender.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=User'}
                  alt="Sender"
                  className="h-9 w-9 rounded-full border border-white/10 bg-gray-900 object-cover shrink-0"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-white/5 border border-white/5 flex items-center justify-center shrink-0">
                  {getToastIcon(toast.type)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">
                  {getToastTitle(toast.type)}
                </span>
                <p className="text-xs font-semibold text-white mt-0.5 leading-snug break-words">{toast.message}</p>
              </div>
              <button
                onClick={() => dismissRichToast(toast.id)}
                className="text-gray-500 hover:text-white transition p-1 bg-white/5 hover:bg-white/10 rounded-lg shrink-0"
              >
                <X size={12} />
              </button>
            </div>

            {/* Accept follow request action button */}
            {toast.type === 'friend_request' && toast.sender && (
              <button
                onClick={() => {
                  handleFollowBack(toast.sender!._id);
                  dismissRichToast(toast.id);
                }}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <UserPlus size={12} /> Confirm / Follow Back
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ─── Nearby Connect Request Modal ─────────────────────────── */}
      {incomingRequest && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9998] w-[90%] max-w-sm bg-[#050505]/95 border border-indigo-500/30 backdrop-blur-2xl rounded-3xl p-5 shadow-2xl">
          <div className="flex items-start gap-4">
            <img
              src={incomingRequest.avatarUrl}
              alt="Avatar"
              className="h-12 w-12 rounded-full border border-indigo-500/50 bg-gray-900 object-cover"
            />
            <div className="flex-1">
              <h4 className="text-xs font-black text-white uppercase tracking-wider">📡 Nearby Connect</h4>
              <p className="text-[10px] text-gray-400 mt-1">
                <strong className="text-white">{incomingRequest.username}</strong> wants to connect with you nearby.
              </p>
              <div className="flex gap-2.5 mt-4">
                <button
                  onClick={() => handleNearbyResponse(true)}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-[10px] text-white font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1"
                >
                  <Check size={12} /> Accept
                </button>
                <button
                  onClick={() => handleNearbyResponse(false)}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-red-400 font-black uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-1"
                >
                  <X size={12} /> Deny
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};
