'use client';

import React, { createContext, useContext, useState, useRef } from 'react';

interface ModalContextType {
  showAlert: (title: string, message: string) => Promise<void>;
  showConfirm: (title: string, message: string, confirmText?: string, cancelText?: string) => Promise<boolean>;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'alert' | 'confirm'>('alert');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [confirmText, setConfirmText] = useState('OK');
  const [cancelText, setCancelText] = useState('Cancel');
  
  const resolverRef = useRef<((value: any) => void) | null>(null);

  const showAlert = (title: string, message: string): Promise<void> => {
    setTitle(title);
    setMessage(message);
    setType('alert');
    setConfirmText('OK');
    setIsOpen(true);
    return new Promise<void>((resolve) => {
      resolverRef.current = resolve;
    });
  };

  const showConfirm = (
    title: string,
    message: string,
    confirmBtnText = 'Confirm',
    cancelBtnText = 'Cancel'
  ): Promise<boolean> => {
    setTitle(title);
    setMessage(message);
    setType('confirm');
    setConfirmText(confirmBtnText);
    setCancelText(cancelBtnText);
    setIsOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  };

  const handleConfirm = () => {
    setIsOpen(false);
    if (resolverRef.current) {
      if (type === 'confirm') {
        resolverRef.current(true);
      } else {
        resolverRef.current(undefined);
      }
    }
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (resolverRef.current && type === 'confirm') {
      resolverRef.current(false);
    }
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md transition-opacity duration-300">
          <div className="w-full max-w-sm glass rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-border">
            <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-2">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-6 whitespace-pre-wrap">{message}</p>
            <div className="flex justify-end gap-2.5">
              {type === 'confirm' && (
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-secondary hover:bg-accent border border-border text-muted-foreground rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  {cancelText}
                </button>
              )}
              <button
                onClick={handleConfirm}
                className="px-5 py-2 bg-primary hover:opacity-90 text-primary-foreground rounded-xl text-xs font-black transition cursor-pointer shadow-lg"
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
