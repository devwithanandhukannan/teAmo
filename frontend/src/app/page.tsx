'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  MessageCircleCode, Video, Compass, Heart, ShieldAlert, Zap, ArrowRight 
} from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsLoggedIn(!!token);
  }, []);

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col justify-center items-center px-4">
      {/* Background radial accent glow */}
      <div className="absolute top-[-15%] left-[-15%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-15%] w-[60%] h-[60%] bg-pink-500/10 rounded-full blur-[140px] pointer-events-none"></div>

      <div className="w-full max-w-5xl flex flex-col items-center text-center gap-8 relative z-10">
        
        {/* Badge header */}
        <div className="inline-flex items-center gap-2 bg-indigo-600/10 border border-indigo-500/20 px-4 py-2 rounded-full text-xs font-bold text-indigo-500 dark:text-indigo-400 glow-primary">
          <Zap size={14} className="animate-pulse text-indigo-400" /> Ephemeral Stranger Video Lounge
        </div>

        {/* Hero title */}
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-6xl font-black text-foreground tracking-tight leading-none max-w-3xl">
            Meet Strangers, Build{' '}
            <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 dark:from-indigo-400 dark:via-purple-500 dark:to-pink-500 bg-clip-text text-transparent">
              Permanent Friendships
            </span>
          </h1>
          <p className="text-sm sm:text-lg text-muted-foreground max-w-xl mx-auto font-medium">
            StrangerMatch combines anonymous video chat with Snapchat stories and radar location scanning.
          </p>
        </div>

        {/* Call to action */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-4">
          {isLoggedIn ? (
            <Link
              href="/match"
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-2xl font-bold text-sm shadow-xl hover:shadow-indigo-500/25 transition transform hover:scale-105 flex items-center gap-2"
            >
              Enter Lounge Room <ArrowRight size={16} />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white rounded-2xl font-bold text-sm shadow-xl hover:shadow-indigo-500/25 transition transform hover:scale-105 flex items-center gap-2"
              >
                Sign In <ArrowRight size={16} />
              </Link>
              <Link
                href="/register"
                className="px-8 py-4 bg-secondary border border-border hover:bg-accent text-foreground rounded-2xl font-bold text-sm transition transform hover:scale-105"
              >
                Register Account
              </Link>
            </>
          )}
        </div>

        {/* Features Showcase Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mt-16 max-w-4xl text-left">
          
          <div className="glass-card rounded-2xl p-6 hover:border-indigo-500/30 transition duration-300">
            <div className="h-12 w-12 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-500 dark:text-indigo-400">
              <Video size={22} />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Video or Text Match</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Match instantly using multi-level Redis sets overlapping interests. Switch from text chat to peer WebRTC video calls seamlessly.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 hover:border-purple-500/30 transition duration-300">
            <div className="h-12 w-12 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center mb-4 text-purple-500 dark:text-purple-400">
              <Compass size={22} />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Geographic Radar Scan</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Toggle scanning to view nearby connections using Redis Geo commands. Showcases proximity telemetry while shielding precise positions.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 hover:border-pink-500/30 transition duration-300">
            <div className="h-12 w-12 rounded-xl bg-pink-600/10 border border-pink-500/20 flex items-center justify-center mb-4 text-pink-500 dark:text-pink-400">
              <Heart size={22} />
            </div>
            <h3 className="text-base font-bold text-foreground mb-2">Ephemeral Stories</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Post 24-hour snaps that automatically self-destruct. Establish permanent friendship ties to directly chat and call anytime.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
}
