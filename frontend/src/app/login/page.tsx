'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Radio, Mail, Lock, Loader2, ArrowRight, ShieldCheck, MailOpen, AlertCircle, RefreshCw } from 'lucide-react';
import { io } from 'socket.io-client';

export default function LoginPage() {
  const router = useRouter();
  
  // Credentials input state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');
  
  // Magic Link verification state
  const [isWaitingLink, setIsWaitingLink] = useState(false);
  const [authSessionId, setAuthSessionId] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [pollTimer, setPollTimer] = useState(300); // 5 minutes count down

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      const user = JSON.parse(userStr);
      router.push(user.username === 'admin' ? '/admin' : '/match');
    }
  }, [router]);

  // Handle countdown timer for link expiration
  useEffect(() => {
    if (isWaitingLink && pollTimer > 0) {
      const interval = setInterval(() => {
        setPollTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (isWaitingLink && pollTimer === 0) {
      setError('Verification session expired. Please try again.');
      setIsWaitingLink(false);
    }
  }, [isWaitingLink, pollTimer]);

  // Socket & Polling logic when waiting for verification link
  useEffect(() => {
    if (!isWaitingLink || !authSessionId) return;

    let pollInterval: NodeJS.Timeout;
    let socket: any;

    // 1. WebSocket setup for real-time verification redirection
    try {
      socket = io(backendUrl);

      socket.on('connect', () => {
        console.log('[Login Page] Socket connected, joining room:', authSessionId);
        socket.emit('join_login_session', { authSessionId });
      });

      socket.on('login_success', (data: { token: string; user: any }) => {
        console.log('[Login Page] Sockets: Login verified successfully!');
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Cleanup and redirect
        if (socket) socket.disconnect();
        if (pollInterval) clearInterval(pollInterval);
        
        window.location.href = data.user.username === 'admin' ? '/admin' : '/match';
      });
    } catch (socketErr) {
      console.warn('[Login Page] Socket connection failed, relying on polling fallback:', socketErr);
    }

    // 2. Polling fallback (hits REST endpoint every 3 seconds)
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/auth/login-status/${authSessionId}`);
        const data = await res.json();

        if (data.success && data.status === 'verified') {
          console.log('[Login Page] Polling: Login verified successfully!');
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          
          if (socket) socket.disconnect();
          clearInterval(pollInterval);
          
          window.location.href = data.user.username === 'admin' ? '/admin' : '/match';
        } else if (data.success && data.status === 'expired') {
          setError('Verification link expired. Please login again.');
          setIsWaitingLink(false);
          if (socket) socket.disconnect();
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('[Login Page] Polling error:', err);
      }
    }, 3000);

    return () => {
      if (socket) socket.disconnect();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isWaitingLink, authSessionId, backendUrl]);

  // Submit login details
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginIdentifier || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginIdentifier, password })
      });
      const data = await res.json();

      if (data.success) {
        if (data.pendingVerification) {
          // Trigger magic link waiting screen
          setVerifiedEmail(data.email);
          setAuthSessionId(data.authSessionId);
          setIsWaitingLink(true);
          setPollTimer(300);
          setError('');
        } else {
          // Direct login (e.g. admin accounts)
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          window.location.href = data.user.username === 'admin' ? '/admin' : '/match';
        }
      } else {
        setError(data.message || 'Login failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection to auth service failed.');
    } finally {
      setLoading(false);
    }
  };

  const formatTimer = () => {
    const mins = Math.floor(pollTimer / 60);
    const secs = pollTimer % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] relative px-4 overflow-hidden">
      {/* Dynamic Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {!isWaitingLink ? (
        <div className="w-full max-w-md glass-card rounded-3xl p-8 relative border border-white/5 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <Radio size={28} className="text-white" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase">Sign In</h2>
            <p className="text-xs text-gray-500 mt-1">Hangout powered by kneazllle</p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold text-center break-all flex items-center justify-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Username or Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Enter username or email"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  className="w-full py-3 pl-11 pr-4 text-xs rounded-xl glass-input"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Password</label>
                <Link href="/forgot-password" className="text-xs text-gray-500 hover:text-white font-semibold transition">
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full py-3 pl-11 pr-4 text-xs rounded-xl glass-input"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-white hover:bg-gray-200 text-black rounded-xl font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <>Sign In <ArrowRight size={14} /></>}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            New here?{' '}
            <Link href="/register" className="text-white font-bold hover:underline transition">
              Create Account
            </Link>
          </p>
        </div>
      ) : (
        /* Render Premium Magic Link Waiting View */
        <div className="w-full max-w-md glass-card rounded-3xl p-8 relative border border-white/5 shadow-2xl flex flex-col items-center text-center">
          <div className="h-16 w-16 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-6 relative">
            <MailOpen size={30} className="text-indigo-400 animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>

          <h2 className="text-lg font-black text-white uppercase tracking-wider">Check Your Email</h2>
          <p className="text-xs text-gray-400 mt-2">
            We sent a secure login link to <strong>{verifiedEmail}</strong>.
          </p>

          {/* Interactive instruction card */}
          <div className="w-full bg-white/2 border border-white/5 rounded-2xl p-4 my-6 text-left">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Instructions</h4>
            <ul className="text-[10px] text-gray-500 space-y-1 list-disc list-inside">
              <li>Open the verification email on any device (phone, laptop).</li>
              <li>Click the <strong>"Verify and Log In"</strong> button.</li>
              <li>This browser will automatically log in and redirect.</li>
            </ul>
          </div>

          <div className="flex flex-col items-center gap-1 mb-6">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <RefreshCw className="animate-spin text-indigo-400" size={10} />
              <span>Waiting for email validation...</span>
            </div>
            <div className="text-[9px] text-gray-600 mt-1">
              Link expires in: <span className="font-bold text-gray-400">{formatTimer()}</span>
            </div>
          </div>

          <button
            onClick={() => setIsWaitingLink(false)}
            className="text-[10px] text-red-400/80 hover:text-red-400 font-bold uppercase tracking-wider transition underline"
          >
            Cancel and try again
          </button>
        </div>
      )}
    </div>
  );
}
