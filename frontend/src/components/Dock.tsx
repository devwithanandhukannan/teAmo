'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Sparkles, Users, Compass, User, PhoneOff, Mic, MicOff, 
  Video, VideoOff, MessageSquare, UserPlus, ShieldAlert, RefreshCw
} from 'lucide-react';

export const Dock: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  
  // Dock modes
  const [isAdmin, setIsAdmin] = useState(false);
  const [matchState, setMatchState] = useState<'idle' | 'searching' | 'connected' | 'group'>('idle');
  const [mode, setMode] = useState<'text' | 'video'>('text');
  const [isDirect, setIsDirect] = useState(false);
  
  // Call controls mirror states
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  // Hide Dock on auth pages
  const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      setIsAdmin(user.username === 'admin');
    }

    // Listen to custom window events from Match and Friends pages
    const handleMatchStatus = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setMatchState(customEvent.detail.state || 'idle');
        setMode(customEvent.detail.mode || 'text');
        setIsDirect(customEvent.detail.isDirect ?? false);
      }
    };

    const handleCallStateUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setAudioMuted(customEvent.detail.audioMuted ?? false);
        setVideoMuted(customEvent.detail.videoMuted ?? false);
        setChatOpen(customEvent.detail.chatOpen ?? true);
      }
    };

    window.addEventListener('match-status-changed', handleMatchStatus);
    window.addEventListener('call-controls-updated', handleCallStateUpdate);

    return () => {
      window.removeEventListener('match-status-changed', handleMatchStatus);
      window.removeEventListener('call-controls-updated', handleCallStateUpdate);
    };
  }, [pathname]);

  if (isAuthPage || isAdmin) return null;

  // Custom Event Triggers to communicate back to the Page components
  const triggerEvent = (name: string, detail?: any) => {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const isCallState = matchState === 'connected' || matchState === 'group';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex items-center gap-3 bg-neutral-950/80 backdrop-blur-xl border border-white/5 px-4 py-2.5 rounded-3xl shadow-2xl pointer-events-auto transition-all duration-300">
        
        {/* Render ACTIVE VIDEO CALL controls in the Dock */}
        {isCallState ? (
          <>
            {/* Hangout Exit / Disconnect (Return to Lobby) */}
            <div 
              onClick={() => triggerEvent('dock-exit')}
              className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110"
            >
              <div className="p-3.5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 rounded-2xl transition animate-pulse">
                <PhoneOff size={18} />
              </div>
              <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                Exit Hangout
              </span>
            </div>

            {/* New Partner Search (Skip) - Only if not a direct friend call */}
            {!isDirect && (
              <div 
                onClick={() => triggerEvent('dock-skip')}
                className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110"
              >
                <div className="p-3.5 bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-2xl transition">
                  <RefreshCw size={18} />
                </div>
                <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                  New Partner
                </span>
              </div>
            )}

            {/* Audio Mute button */}
            <div 
              onClick={() => triggerEvent('dock-mute-audio')}
              className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110"
            >
              <div className={`p-3.5 rounded-2xl border transition ${audioMuted ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'}`}>
                {audioMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </div>
              <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                {audioMuted ? 'Unmute Mic' : 'Mute Mic'}
              </span>
            </div>

            {/* Video Toggle button */}
            <div 
              onClick={() => triggerEvent('dock-mute-video')}
              className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110"
            >
              <div className={`p-3.5 rounded-2xl border transition ${videoMuted ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'}`}>
                {videoMuted ? <VideoOff size={18} /> : <Video size={18} />}
              </div>
              <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                {videoMuted ? 'Start Camera' : 'Stop Camera'}
              </span>
            </div>

            {/* Toggle Chat Box */}
            <div 
              onClick={() => triggerEvent('dock-toggle-chat')}
              className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110"
            >
              <div className={`p-3.5 rounded-2xl border transition ${chatOpen ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'}`}>
                <MessageSquare size={18} />
              </div>
              <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                {chatOpen ? 'Hide Chat' : 'Show Chat'}
              </span>
            </div>

            {/* Friend Request / Follow */}
            {!isDirect && matchState === 'connected' && (
              <div 
                onClick={() => triggerEvent('dock-friend')}
                className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110"
              >
                <div className="p-3.5 bg-white/5 border border-white/5 text-gray-400 hover:text-white rounded-2xl transition">
                  <UserPlus size={18} />
                </div>
                <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                  Add Friend
                </span>
              </div>
            )}
          </>
        ) : (
          /* Render DEFAULT NAVIGATION controls in the Dock */
          <>
            {/* Match Lobby Link */}
            <Link href="/match" className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110">
              <div className={`p-3.5 rounded-2xl border transition ${pathname === '/match' ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'}`}>
                <Sparkles size={18} />
              </div>
              <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                Lounge Room
              </span>
            </Link>

            {/* Friends list link */}
            <Link href="/friends" className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110">
              <div className={`p-3.5 rounded-2xl border transition ${pathname === '/friends' ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'}`}>
                <Users size={18} />
              </div>
              <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                Friends Feed
              </span>
            </Link>

            {/* Nearby Scanner link */}
            <Link href="/nearby" className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110">
              <div className={`p-3.5 rounded-2xl border transition ${pathname === '/nearby' ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/5 hover:text-white'}`}>
                <Compass size={18} />
              </div>
              <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                Radar Scan
              </span>
            </Link>

            {/* Profile Drawer trigger */}
            <div 
              onClick={() => triggerEvent('dock-open-profile')}
              className="group relative flex flex-col items-center justify-center transition-all duration-200 origin-bottom cursor-pointer hover:scale-110"
            >
              <div className="p-3.5 rounded-2xl border bg-white/5 text-gray-400 border-white/5 hover:text-white transition">
                <User size={18} />
              </div>
              <span className="absolute -top-12 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 bg-neutral-950/95 border border-white/10 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white whitespace-nowrap pointer-events-none transition-all duration-200">
                Profile Settings
              </span>
            </div>
          </>
        )}

      </div>
    </div>
  );
};
