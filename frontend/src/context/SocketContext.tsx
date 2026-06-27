'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

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

  const handleResponse = async (accepted: boolean) => {
    if (!socket || !incomingRequest) return;
    socket.emit('nearby_response', { fromUserId: incomingRequest._id, accepted });
    setIncomingRequest(null);
    if (accepted) {
      setTimeout(async () => {
        await fetchFriends();
        await fetchNotifications();
      }, 500);
    }
  };

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  const fetchFriends = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${backendUrl}/api/friends/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) {
        localStorage.clear();
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success) {
        setFriends(data.friends);
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const fetchNotifications = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${backendUrl}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) {
        localStorage.clear();
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const clearAllNotifications = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${backendUrl}/api/notifications`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 403) {
        localStorage.clear();
        window.location.href = '/login';
        return;
      }
      const data = await res.json();
      if (data.success) {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  const sendDirectMessage = (toUserId: string, text: string) => {
    if (!socket) return;
    
    // Send to server
    socket.emit('direct_message', { toUserId, text });
    
    // Append locally
    const newMessage: Message = {
      senderId: 'me',
      text,
      createdAt: new Date()
    };
    
    setDirectMessages(prev => ({
      ...prev,
      [toUserId]: [...(prev[toUserId] || []), newMessage]
    }));
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) return;
    const user = JSON.parse(userStr);

    const newSocket = io(backendUrl);

    newSocket.on('connect', () => {
      console.log('Socket client connected:', newSocket.id);
      newSocket.emit('authenticate', { token, userId: user._id });
      setSocket(newSocket);
    });

    newSocket.on('force_match_redirect', ({ mode }) => {
      window.location.href = `/match?mode=${mode || 'video'}`;
    });

    // Handle online metrics
    newSocket.on('online_metrics', ({ count }) => {
      setOnlineCount(count);
    });

    // Friends Online/Offline status triggers
    newSocket.on('friend_online', ({ userId }) => {
      setFriends(prev =>
        prev.map(f => (f._id === userId ? { ...f, isOnline: true } : f))
      );
      fetchNotifications();
    });

    newSocket.on('friend_offline', ({ userId }) => {
      setFriends(prev =>
        prev.map(f => (f._id === userId ? { ...f, isOnline: false } : f))
      );
    });

    // Direct private messaging between friends
    newSocket.on('direct_message', ({ senderId, text, createdAt }) => {
      const newMessage: Message = {
        senderId,
        text,
        createdAt: new Date(createdAt)
      };
      setDirectMessages(prev => ({
        ...prev,
        [senderId]: [...(prev[senderId] || []), newMessage]
      }));
    });

    // Group chat socket notifications
    newSocket.on('joined_group', ({ group }) => {
      setActiveGroup(group);
      setGroupMessages([]);
    });

    newSocket.on('group_user_joined', ({ user }) => {
      setActiveGroup(prev => {
        if (!prev) return null;
        if (prev.members.some(m => m._id === user._id)) return prev;
        return {
          ...prev,
          members: [...prev.members, user]
        };
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

    // Handle account bans
    newSocket.on('banned', () => {
      alert('Your account has been banned by the Administrator.');
      localStorage.clear();
      window.location.href = '/login';
    });

    // Real-time notification updates
    newSocket.on('new_notification', (notification) => {
      setNotifications(prev => [notification, ...prev]);
      window.dispatchEvent(new CustomEvent('show-system-notification', { detail: notification }));
    });

    // Nearby Connection Request listeners
    newSocket.on('nearby_request_received', ({ fromUser }) => {
      setIncomingRequest(fromUser);
    });

    newSocket.on('nearby_request_cancelled', ({ fromUserId }) => {
      setIncomingRequest(prev => {
        if (prev && prev._id === fromUserId) {
          return null;
        }
        return prev;
      });
    });

    // Retrieve initial datasets
    fetchFriends();
    fetchNotifications();

    return () => {
      newSocket.disconnect();
    };
  }, []);

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
      {incomingRequest && (
        <div className="fixed top-24 right-6 z-[9999] w-[90%] max-w-sm bg-[#050505]/95 border border-white/10 backdrop-blur-xl rounded-3xl p-5 shadow-2xl animate-in slide-in-from-right duration-300">
          <div className="flex items-start gap-4">
            <img 
              src={incomingRequest.avatarUrl} 
              alt="Avatar" 
              className="h-10 w-10 rounded-full border border-indigo-500/50 bg-gray-900 object-cover" 
            />
            <div className="flex-1">
              <h4 className="text-xs font-black text-white uppercase tracking-wider">Nearby Connect</h4>
              <p className="text-[10px] text-gray-400 mt-1">
                <strong>{incomingRequest.username}</strong> is requesting to connect with you.
              </p>
              <div className="flex gap-2.5 mt-4">
                <button
                  onClick={() => handleResponse(true)}
                  className="flex-1 py-2 bg-white hover:bg-gray-200 text-[10px] text-black font-black uppercase tracking-wider rounded-xl transition"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleResponse(false)}
                  className="flex-1 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-red-400 font-black uppercase tracking-wider rounded-xl transition"
                >
                  Deny
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
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
