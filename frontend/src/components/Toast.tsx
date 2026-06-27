'use client';

import React, { createContext, useContext, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface ToastContextProps {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    // Auto dismiss after 4 seconds
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
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
