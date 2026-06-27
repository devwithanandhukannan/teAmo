'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { X, AlertCircle, Bell, Heart, UserPlus } from 'lucide-react';

interface ToastContextProps {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sysNotification, setSysNotification] = useState<any | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    const handleSystemNotification = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setSysNotification(customEvent.detail);
        
        // Auto dismiss after 5 seconds
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          setSysNotification(null);
        }, 5000);
      }
    };

    window.addEventListener('show-system-notification', handleSystemNotification);
    return () => {
      window.removeEventListener('show-system-notification', handleSystemNotification);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Determine lucide icon based on notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'friend_accept':
        return <Heart className="text-pink-500 shrink-0" size={18} />;
      case 'friend_request':
        return <UserPlus className="text-indigo-400 shrink-0" size={18} />;
      default:
        return <Bell className="text-amber-400 shrink-0" size={18} />;
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Standard bottom Toast */}
      {toastMessage && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm glass toast-animate rounded-2xl p-4 flex items-center justify-between shadow-2xl border border-white/10">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-indigo-400 shrink-0" size={18} />
            <span className="text-xs font-bold text-gray-200">{toastMessage}</span>
          </div>
          <button 
            onClick={() => setToastMessage(null)}
            className="text-gray-400 hover:text-white transition ml-2 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Real-time system Notification Toast (top-right macOS style) */}
      {sysNotification && (
        <div className="fixed top-6 right-6 z-[9999] w-[90%] max-w-sm bg-neutral-950/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex items-start gap-3.5 shadow-2xl animate-in slide-in-from-top-4 duration-300">
          {sysNotification.sender ? (
            <img 
              src={sysNotification.sender.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=Stranger'} 
              alt="Sender" 
              className="h-9 w-9 rounded-full border border-white/10 bg-gray-900 object-cover shrink-0 mt-0.5"
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-white/5 border border-white/5 flex items-center justify-center shrink-0 mt-0.5">
              {getNotificationIcon(sysNotification.type)}
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider block">
              {sysNotification.type === 'friend_accept' ? 'New Match!' : 
               sysNotification.type === 'friend_request' ? 'New Connection' : 'Alert'}
            </span>
            <p className="text-xs font-bold text-white mt-0.5 leading-snug break-words">
              {sysNotification.message}
            </p>
          </div>

          <button 
            onClick={() => setSysNotification(null)}
            className="text-gray-500 hover:text-white transition p-1 bg-white/5 hover:bg-white/10 rounded-lg shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      )}
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
