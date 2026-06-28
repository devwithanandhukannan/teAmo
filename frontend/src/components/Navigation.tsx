'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSocket } from '../context/SocketContext';
import { Radio, EyeOff, Shield, Sun, Moon, Bell, Trash2, Heart, UserPlus, AlertCircle, Check, X } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { getBackendUrl } from '@/config';

export interface NotificationItem {
  _id: string;
  type: string;
  message: string;
  sender?: {
    _id: string;
    username: string;
    avatarUrl: string;
  };
  createdAt: string;
}

export const Navigation: React.FC = () => {
  const pathname = usePathname();
  const { onlineCount } = useSocket();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<{ username: string; avatarUrl: string } | null>(null);
  
  // Notifications state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  
  // Theme and incognito state
  const [incognito, setIncognito] = useState(false);

  const isAuthPage = ['/', '/login', '/register', '/forgot-password', '/reset-password'].includes(pathname) || pathname.startsWith('/admin');
  const backendUrl = getBackendUrl();

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }

    // Load initial incognito theme state from DOM
    const hasIncognito = document.body.classList.contains('incognito-mode');
    setIncognito(hasIncognito);

    const handleIncognitoToggle = (e: Event) => {
      const customEvent = e as CustomEvent;
      setIncognito(customEvent.detail ?? false);
    };

    window.addEventListener('incognito-toggled', handleIncognitoToggle);
    return () => {
      window.removeEventListener('incognito-toggled', handleIncognitoToggle);
    };
  }, [pathname]);

  // Fetch notifications
  useEffect(() => {
    if (isAuthPage) return;

    const fetchNotifications = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const res = await fetch(`${backendUrl}/api/notifications`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
          setNotifications(data.notifications);
          setUnreadCount(data.notifications.length); // assuming all fetched are unread or we just show count
        }
      } catch (err) {
        console.error('Failed to fetch notifications', err);
      }
    };
    fetchNotifications();

    const handleSystemNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setNotifications(prev => [customEvent.detail, ...prev]);
        setUnreadCount(prev => prev + 1);
      }
    };

    window.addEventListener('show-system-notification', handleSystemNotification);
    return () => {
      window.removeEventListener('show-system-notification', handleSystemNotification);
    };
  }, [isAuthPage, backendUrl]);

  // Click outside to close notification menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleClearNotifications = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      await fetch(`${backendUrl}/api/notifications`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to clear notifications', err);
    }
  };

  const handleFollowAction = async (notifId: string, senderId: string, action: 'accept' | 'reject') => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${backendUrl}/api/friends/follow/${senderId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        // Remove the notification from the list after action
        setNotifications(prev => prev.filter(n => n._id !== notifId));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error(`Failed to ${action} follow request`, err);
    }
  };

  const toggleIncognitoTheme = () => {
    const nextVal = !incognito;
    setIncognito(nextVal);
    if (nextVal) {
      document.body.classList.add('incognito-mode');
    } else {
      document.body.classList.remove('incognito-mode');
    }
    window.dispatchEvent(new CustomEvent('incognito-toggled', { detail: nextVal }));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'friend_accept': return <Heart className="text-pink-500 shrink-0" size={16} />;
      case 'friend_request': return <UserPlus className="text-indigo-400 shrink-0" size={16} />;
      default: return <AlertCircle className="text-amber-400 shrink-0" size={16} />;
    }
  };

  if (isAuthPage || user?.username === 'admin') return null;

  const isAdmin = user?.username === 'admin';

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-6xl z-[999] glass rounded-2xl px-6 py-3.5 flex items-center justify-between shadow-2xl transition">
      
      {/* Brand logo rebrand to Hangout */}
      <Link href="/match" className="flex items-center gap-2 hover:scale-102 transition">
        <div className={`p-1.5 rounded-lg ${incognito ? 'bg-purple-500/20 border border-purple-500/30 text-purple-400 owl-neon' : 'bg-secondary border border-border text-foreground'}`}>
          {incognito ? <EyeOff size={18} /> : <Radio size={18} />}
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="text-foreground text-sm font-black tracking-widest uppercase">
            {incognito ? 'INCOGNITO OWL' : 'HANGOUT'}
          </span>
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">
            powered by kneazllle
          </span>
        </div>
      </Link>

      {/* Online Status, Theme, Incognito and Profile Actions */}
      <div className="flex items-center gap-3 sm:gap-4 relative">
        
        {/* Real-time telemetry */}
        <div className="hidden sm:flex items-center gap-2 bg-secondary border border-border px-3 py-1.5 rounded-xl">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-ping"></span>
          <span className="text-[11px] font-bold text-foreground">
            {onlineCount} Online
          </span>
        </div>

        {/* Notifications Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifMenu(!showNotifMenu);
              if (!showNotifMenu) setUnreadCount(0); // clear count on open
            }}
            className="p-2 rounded-xl bg-secondary border border-border hover:bg-accent text-foreground transition relative cursor-pointer"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-background animate-in zoom-in">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-0 mt-3 w-80 bg-background/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200">
              <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/50">
                <h3 className="text-xs font-black text-foreground uppercase tracking-widest">Notifications</h3>
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearNotifications}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 rounded-lg transition"
                  >
                    <Trash2 size={12} /> Clear All
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto p-2 space-y-2">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-xs font-bold">
                    No new notifications
                  </div>
                ) : (
                  notifications.map((notif, idx) => (
                    <div key={notif._id || idx} className="flex items-start gap-3 p-3 rounded-xl hover:bg-secondary/50 transition">
                      {notif.sender ? (
                        <img 
                          src={notif.sender.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=Stranger'} 
                          alt="Sender" 
                          className="h-8 w-8 rounded-full border border-border bg-muted object-cover shrink-0 mt-0.5"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5">
                          {getNotificationIcon(notif.type)}
                        </div>
                      )}
                      <div className="flex-1">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-0.5">
                          {notif.type === 'friend_accept' ? 'New Match!' : 
                           notif.type === 'follow_request' ? 'Follow Request' : 'Alert'}
                        </span>
                        <p className="text-xs font-bold text-foreground leading-snug">
                          {notif.message}
                        </p>
                        
                        {notif.type === 'follow_request' && notif.sender && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleFollowAction(notif._id, notif.sender!._id, 'accept')}
                              className="flex-1 flex items-center justify-center gap-1 bg-green-500/20 hover:bg-green-500/30 text-green-500 py-1.5 rounded-lg text-[10px] font-bold transition"
                            >
                              <Check size={12} /> Accept
                            </button>
                            <button
                              onClick={() => handleFollowAction(notif._id, notif.sender!._id, 'reject')}
                              className="flex-1 flex items-center justify-center gap-1 bg-red-500/20 hover:bg-red-500/30 text-red-500 py-1.5 rounded-lg text-[10px] font-bold transition"
                            >
                              <X size={12} /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Theme Segmented Switcher */}
        <div className="hidden md:flex bg-secondary border border-border rounded-xl p-0.5 items-center gap-0.5 shadow-inner">
          <button
            onClick={() => setTheme('light')}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              theme === 'light' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sun size={13} />
          </button>
          <button
            onClick={() => setTheme('dark')}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              theme === 'dark' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Moon size={13} />
          </button>
        </div>

        {/* Incognito Shield Toggle */}
        {!isAdmin && (
          <button
            onClick={toggleIncognitoTheme}
            className={`p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
              incognito 
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' 
                : 'bg-secondary text-muted-foreground border-border hover:text-foreground'
            }`}
            title="Toggle incognito owl theme"
          >
            <Shield size={14} />
            <span className="hidden lg:inline">{incognito ? 'Incognito' : 'Privacy Shield'}</span>
          </button>
        )}

        {user && (
          <div className="flex items-center gap-3 pl-2 sm:border-l border-border">
            <img
              src={user.avatarUrl}
              alt="Avatar"
              className="h-8 w-8 rounded-full border border-border bg-muted object-cover cursor-pointer"
              onClick={() => window.dispatchEvent(new Event('open-profile-drawer'))}
            />
          </div>
        )}
      </div>
    </header>
  );
};
