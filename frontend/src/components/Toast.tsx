'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { X, AlertCircle, Bell, Heart, UserPlus } from 'lucide-react';

interface ToastContextProps {
  showToast: (message: string, type?: string) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<any[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((notif: any) => {
    const id = Date.now().toString() + Math.random().toString();
    setNotifications(prev => [...prev, { ...notif, id }]);
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  }, [removeNotification]);

  const showToast = useCallback((message: string, type: string = 'info') => {
    addNotification({ message, type, isSystem: false });
  }, [addNotification]);

  useEffect(() => {
    const handleSystemNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        addNotification({ ...customEvent.detail, isSystem: true });
      }
    };

    window.addEventListener('show-system-notification', handleSystemNotification);
    return () => {
      window.removeEventListener('show-system-notification', handleSystemNotification);
    };
  }, [addNotification]);

  // Determine lucide icon based on notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'friend_accept':
        return <Heart className="shrink-0" size={18} />;
      case 'friend_request':
        return <UserPlus className="shrink-0" size={18} />;
      case 'error':
        return <AlertCircle className="shrink-0" size={18} />;
      default:
        return <Bell className="shrink-0" size={18} />;
    }
  };

  const getBackgroundColor = (type: string, isSystem: boolean) => {
    if (type === 'friend_accept') return 'bg-pink-500/10 border-pink-500/20 text-pink-400';
    if (type === 'friend_request') return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400';
    if (type === 'error') return 'bg-red-500/10 border-red-500/20 text-red-400';
    if (isSystem) return 'bg-neutral-900/80 border-white/10 text-white';
    return 'bg-secondary border-border text-foreground'; // standard toast
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Container (Top-Right Stacked) */}
      <div className="fixed top-24 right-6 z-[9999] flex flex-col gap-3 w-[90%] max-w-sm pointer-events-none items-end">
        {notifications.map((notif) => (
          <div 
            key={notif.id}
            className={`pointer-events-auto w-full backdrop-blur-xl border rounded-2xl p-4 flex items-start gap-3.5 shadow-2xl animate-in slide-in-from-right-4 duration-300 ${getBackgroundColor(notif.type, notif.isSystem)}`}
          >
            {notif.isSystem && notif.sender ? (
              <img 
                src={notif.sender.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=Stranger'} 
                alt="Sender" 
                className="h-9 w-9 rounded-full border border-current bg-muted object-cover shrink-0 mt-0.5"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-current/10 border border-current/20 flex items-center justify-center shrink-0 mt-0.5">
                {getNotificationIcon(notif.type)}
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              {notif.isSystem ? (
                <>
                  <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80">
                    {notif.type === 'friend_accept' ? 'New Match!' : 
                     notif.type === 'friend_request' ? 'New Connection' : 'Alert'}
                  </span>
                  <p className="text-[10px] font-bold mt-0.5 leading-snug break-words">
                    {notif.message}
                  </p>
                </>
              ) : (
                <div className="flex items-center h-full pt-1.5">
                  <span className="text-[10px] font-bold">{notif.message}</span>
                </div>
              )}
            </div>

            <button 
              onClick={() => removeNotification(notif.id)}
              className="opacity-50 hover:opacity-100 transition p-1 bg-current/5 hover:bg-current/10 rounded-lg shrink-0 cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
