'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSocket } from '../context/SocketContext';
import { LogOut, Radio, EyeOff, Shield } from 'lucide-react';

export const Navigation: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { onlineCount } = useSocket();
  const [user, setUser] = useState<{ username: string; avatarUrl: string } | null>(null);
  
  // Theme and incognito state
  const [incognito, setIncognito] = useState(false);

  const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname) || pathname.startsWith('/admin');

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

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  // Toggle Incognito Theme globally on document body
  const toggleIncognitoTheme = () => {
    const nextVal = !incognito;
    setIncognito(nextVal);
    if (nextVal) {
      document.body.classList.add('incognito-mode');
    } else {
      document.body.classList.remove('incognito-mode');
    }
    // Dispatch to page components
    window.dispatchEvent(new CustomEvent('incognito-toggled', { detail: nextVal }));
  };

  if (isAuthPage || user?.username === 'admin') return null;

  const isAdmin = user?.username === 'admin';

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-6xl z-50 glass rounded-2xl px-6 py-3.5 flex items-center justify-between shadow-2xl transition">
      
      {/* Brand logo rebrand to Hangout */}
      <Link href="/match" className="flex items-center gap-2 hover:scale-102 transition">
        <div className={`p-1.5 rounded-lg ${incognito ? 'bg-purple-500/20 border border-purple-500/30 text-purple-400 owl-neon' : 'bg-white/10 border border-white/10 text-white'}`}>
          {incognito ? <EyeOff size={18} /> : <Radio size={18} />}
        </div>
        <div className="flex flex-col items-start leading-none">
          <span className="text-white text-sm font-black tracking-widest uppercase">
            {incognito ? 'INCOGNITO OWL' : 'HANGOUT'}
          </span>
          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">
            powered by kneazllle
          </span>
        </div>
      </Link>

      {/* Online Status, Incognito and Profile Actions */}
      <div className="flex items-center gap-4">
        
        {/* Real-time telemetry (without fake offsets) */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-xl">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-ping"></span>
          <span className="text-[11px] font-bold text-gray-300">
            {onlineCount} Online
          </span>
        </div>

        {/* Incognito Shield Toggle */}
        {!isAdmin && (
          <button
            onClick={toggleIncognitoTheme}
            className={`p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-bold ${
              incognito 
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' 
                : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'
            }`}
            title="Toggle incognito owl theme"
          >
            <Shield size={14} />
            <span className="hidden sm:inline">{incognito ? 'Incognito' : 'Privacy Shield'}</span>
          </button>
        )}

        {user && (
          <div className="flex items-center gap-3 pl-2 border-l border-white/10">
            <img
              src={user.avatarUrl}
              alt="Avatar"
              className="h-7 w-7 rounded-full border border-white/10 bg-gray-900"
            />
            <span className="hidden sm:inline text-xs font-bold text-gray-300 max-w-[80px] truncate">
              {user.username}
            </span>
          </div>
        )}
      </div>
    </header>
  );
};
