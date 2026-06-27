'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Heart, UserPlus, Bell, X, Check } from 'lucide-react';

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

// Rich toast notification for real-time socket alerts
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
}

const SocketContext = createContext<SocketContextProps | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeGroup, setActiveGroup] = useState<GroupInfo | null>(null);
  const [groupMessages, setGroupMessages] = useState<Message[]>([]);
  const [directMessages, setDirectMessages] = useState<{ [key: string]: Message[] }>({});
  const [incomingRequest, setIncomingRequest] = useState<UserInfo | null>(null);
  const [richToasts, setRichToasts] = useState<RichToast[]>([]);
  
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  // Show a rich toast notification
  const showRichToast = useCallback((toast: Omit<RichToast, 'id'>) => {
    const id = Date.now().toString();
    setRichToasts(prev => [...prev, { ...toast, id }]);
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setRichToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
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
    setSocket(currentSocket => {
      if (!currentSocket) return currentSocket;
      currentSocket.emit('direct_message', { toUserId, text });
      const newMessage: Message = { senderId: 'me', text, createdAt: new Date() };
      setDirectMessages(prev => ({
        ...prev,
        [toUserId]: [...(prev[toUserId] || []), newMessage]
      }));
      return currentSocket;
    });
  }, []);

  const handleNearbyResponse = useCallback((accepted: boolean) => {
    setSocket(currentSocket => {
      if (!currentSocket || !incomingRequest) return currentSocket;
      currentSocket.emit('nearby_response', { fromUserId: incomingRequest._id, accepted });
      setIncomingRequest(null);
      if (accepted) {
        setTimeout(async () => {
          await fetchFriends();
          await fetchNotifications();
        }, 500);
      }
      return currentSocket;
    });
  }, [incomingRequest, fetchFriends, fetchNotifications]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) return;
    const user = JSON.parse(userStr);

    const newSocket = io(backendUrl, {
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      newSocket.emit('authenticate', { token, userId: user._id });
      setSocket(newSocket);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    newSocket.on('force_match_redirect', ({ mode }) => {
      window.location.href = `/match?mode=${mode || 'video'}`;
    });

    newSocket.on('online_metrics', ({ count }) => {
      setOnlineCount(count);
    });

    newSocket.on('friend_online', ({ userId }) => {
      setFriends(prev => prev.map(f => f._id === userId ? { ...f, isOnline: true } : f));
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

    newSocket.on('banned', () => {
      alert('Your account has been banned by the Administrator.');
      localStorage.clear();
      window.location.href = '/login';
    });

    // Real-time notification: show rich toast AND update notification list
    newSocket.on('new_notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      
      // Show a rich glassmorphic toast for this notification
      showRichToast({
        type: notification.type as any,
        message: notification.message,
        sender: notification.sender
      });

      // Also dispatch for legacy listeners
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
    };
  }, []);

  const getToastIcon = (type: string) => {
    switch (type) {
      case 'friend_accept': return <Heart size={18} className="text-pink-400 shrink-0" />;
      case 'friend_request': return <UserPlus size={18} className="text-indigo-400 shrink-0" />;
      default: return <Bell size={18} className="text-amber-400 shrink-0" />;
    }
  };

  const getToastTitle = (type: string) => {
    switch (type) {
      case 'friend_accept': return '🎉 New Match!';
      case 'friend_request': return '👋 New Follow';
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
        setDirectMessages
      }}
    >
      {children}

      {/* Rich Socket Notification Toasts — stacked top-right */}
      <div className="fixed top-24 right-4 z-[9999] flex flex-col gap-3 w-[90%] max-w-xs pointer-events-none">
        {richToasts.map(toast => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-neutral-950/90 border border-white/10 backdrop-blur-2xl rounded-2xl p-4 flex items-start gap-3 shadow-2xl"
            style={{
              animation: 'slideInFromRight 0.35s ease-out',
            }}
          >
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
        ))}
      </div>

      {/* Nearby Connect Request Modal */}
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
