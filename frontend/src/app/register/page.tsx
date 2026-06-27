'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Radio, Mail, Lock, User, Loader2, ArrowRight, ShieldCheck, MailOpen, AlertCircle, RefreshCw } from 'lucide-react';
import { io } from 'socket.io-client';

export default function RegisterPage() {
  const router = useRouter();
  
  // Registration form inputs
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Real-time checks states
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  
  // Magic Link verification state
  const [isWaitingLink, setIsWaitingLink] = useState(false);
  const [authSessionId, setAuthSessionId] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [pollTimer, setPollTimer] = useState(300); // 5 minutes

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  // Debounced real-time checks for username availability
  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const delay = setTimeout(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/auth/check-exists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (data.success) {
          setUsernameStatus(data.usernameExists ? 'taken' : 'available');
        }
      } catch (err) {
        console.error(err);
      }
    }, 400);

    return () => clearTimeout(delay);
  }, [username, backendUrl]);

  // Debounced real-time checks for email availability
  useEffect(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailStatus('idle');
      return;
    }

    setEmailStatus('checking');
    const delay = setTimeout(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/auth/check-exists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success) {
          setEmailStatus(data.emailExists ? 'taken' : 'available');
        }
      } catch (err) {
        console.error(err);
      }
    }, 400);

    return () => clearTimeout(delay);
  }, [email, backendUrl]);

  // Countdown timer
  useEffect(() => {
    if (isWaitingLink && pollTimer > 0) {
      const interval = setInterval(() => {
        setPollTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    } else if (isWaitingLink && pollTimer === 0) {
      setError('Registration session expired. Please register again.');
      setIsWaitingLink(false);
    }
  }, [isWaitingLink, pollTimer]);

  // Sockets and Polling listener for magic link activation during registration
  useEffect(() => {
    if (!isWaitingLink || !authSessionId) return;

    let pollInterval: NodeJS.Timeout;
    let socket: any;

    try {
      socket = io(backendUrl);

      socket.on('connect', () => {
        console.log('[Register Page] Socket connected, joining room:', authSessionId);
        socket.emit('join_login_session', { authSessionId });
      });

      socket.on('login_success', (data: { token: string; user: any }) => {
        console.log('[Register Page] Sockets: Email verification successful!');
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        
        if (socket) socket.disconnect();
        if (pollInterval) clearInterval(pollInterval);
        
        window.location.href = '/match';
      });
    } catch (socketErr) {
      console.warn('[Register Page] Socket failed, using polling fallback:', socketErr);
    }

    // Polling fallback every 3 seconds
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/api/auth/login-status/${authSessionId}`);
        const data = await res.json();

        if (data.success && data.status === 'verified') {
          console.log('[Register Page] Polling: Registration verified successfully!');
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          
          if (socket) socket.disconnect();
          clearInterval(pollInterval);
          
          window.location.href = '/match';
        } else if (data.success && data.status === 'expired') {
          setError('Registration verification link expired.');
          setIsWaitingLink(false);
          if (socket) socket.disconnect();
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('[Register Page] Polling error:', err);
      }
    }, 3000);

    return () => {
      if (socket) socket.disconnect();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isWaitingLink, authSessionId, backendUrl]);

  // Submit registration form
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (usernameStatus === 'taken' || emailStatus === 'taken') {
      setError('Username or email is already taken.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${backendUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();

      if (data.success && data.pendingVerification) {
        setVerifiedEmail(data.email);
        setAuthSessionId(data.authSessionId);
        setIsWaitingLink(true);
        setPollTimer(300);
      } else {
        setError(data.message || 'Registration failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection to server failed.');
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
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {!isWaitingLink ? (
        <div className="w-full max-w-md glass-card rounded-3xl p-8 relative border border-white/5 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <Radio size={28} className="text-white" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight uppercase">Create Account</h2>
            <p className="text-xs text-gray-500 mt-1">Hangout powered by kneazllle</p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold text-center flex items-center justify-center gap-2">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegisterSubmit} className="space-y-5">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Username</label>
              <div className="relative">
                <User size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Choose username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                  className="w-full py-3 pl-11 pr-4 text-xs rounded-xl glass-input"
                  required
                />
              </div>
              {usernameStatus === 'checking' && <span className="text-[10px] text-gray-500 block mt-1 pl-1">Checking availability...</span>}
              {usernameStatus === 'taken' && <span className="text-[10px] text-red-400 block mt-1 pl-1 font-semibold">Username taken</span>}
              {usernameStatus === 'available' && <span className="text-[10px] text-green-400 block mt-1 pl-1 font-semibold">Username is available</span>}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Email Address</label>
              <div className="relative">
                <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="email"
                  placeholder="Enter email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full py-3 pl-11 pr-4 text-xs rounded-xl glass-input"
                  required
                />
              </div>
              {emailStatus === 'checking' && <span className="text-[10px] text-gray-500 block mt-1 pl-1">Checking database...</span>}
              {emailStatus === 'taken' && <span className="text-[10px] text-red-400 block mt-1 pl-1 font-semibold">Email already registered</span>}
              {emailStatus === 'available' && <span className="text-[10px] text-green-400 block mt-1 pl-1 font-semibold">Email is available</span>}
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Password</label>
              <div className="relative">
                <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  placeholder="Choose password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full py-3 pl-11 pr-4 text-xs rounded-xl glass-input"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || usernameStatus === 'checking' || emailStatus === 'checking'}
              className="w-full py-3.5 bg-white hover:bg-gray-200 text-black rounded-xl font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="animate-spin" size={16} /> : <>Continue <ArrowRight size={14} /></>}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            Already registered?{' '}
            <Link href="/login" className="text-white font-bold hover:underline transition">
              Sign In
            </Link>
          </p>
        </div>
      ) : (
        /* Render Premium Magic Link Waiting View on Register */
        <div className="w-full max-w-md glass-card rounded-3xl p-8 relative border border-white/5 shadow-2xl flex flex-col items-center text-center">
          <div className="h-16 w-16 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-6 relative">
            <MailOpen size={30} className="text-indigo-400 animate-bounce" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>

          <h2 className="text-lg font-black text-white uppercase tracking-wider">Confirm Your Email</h2>
          <p className="text-xs text-gray-400 mt-2">
            A verification link was sent to <strong>{verifiedEmail}</strong>.
          </p>

          <div className="w-full bg-white/2 border border-white/5 rounded-2xl p-4 my-6 text-left">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Verification Instructions</h4>
            <ul className="text-[10px] text-gray-500 space-y-1 list-disc list-inside">
              <li>Open your email client on any device.</li>
              <li>Click the link inside the <strong>"Verify your login"</strong> email.</li>
              <li>Your registration will instantly complete and redirect here.</li>
            </ul>
          </div>

          <div className="flex flex-col items-center gap-1 mb-6">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <RefreshCw className="animate-spin text-indigo-400" size={10} />
              <span>Awaiting link activation...</span>
            </div>
            <div className="text-[9px] text-gray-600 mt-1">
              Link active for: <span className="font-bold text-gray-400">{formatTimer()}</span>
            </div>
          </div>

          <button
            onClick={() => setIsWaitingLink(false)}
            className="text-[10px] text-red-400/80 hover:text-red-400 font-bold uppercase tracking-wider transition underline"
          >
            Cancel and edit details
          </button>
        </div>
      )}
    </div>
  );
}
