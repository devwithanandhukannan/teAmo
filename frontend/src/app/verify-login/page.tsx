'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, ShieldAlert, Loader2, ArrowRight, Radio } from 'lucide-react';
import { getBackendUrl } from '@/config';

function VerifyLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your login link...');
  const [loading, setLoading] = useState(true);

  const backendUrl = getBackendUrl();

  useEffect(() => {
    if (!token || !email) {
      setStatus('error');
      setMessage('Invalid verification link. Missing token or email parameters.');
      setLoading(false);
      return;
    }

    const verifyLink = async () => {
      try {
        console.log(`Verifying login link for email ${email} and token ${token}`);
        const res = await fetch(`${backendUrl}/api/auth/verify-login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, email })
        });
        const data = await res.json();

        if (data.success) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          setStatus('success');
          setMessage('Login session authorized successfully!');
          
          // Redirect to matchmaking platform
          setTimeout(() => {
            window.location.href = data.user.username === 'admin' ? '/admin' : '/match';
          }, 2000);
        } else {
          setStatus('error');
          setMessage(data.message || 'Verification failed. The link may have expired or is invalid.');
        }
      } catch (err) {
        console.error(err);
        setStatus('error');
        setMessage('Network error. Failed to communicate with the verification server.');
      } finally {
        setLoading(false);
      }
    };

    verifyLink();
  }, [token, email, backendUrl]);

  return (
    <div className="w-full max-w-md glass-card rounded-3xl p-8 relative border border-white/5 shadow-2xl">
      <div className="flex flex-col items-center text-center">
        {/* Animated header */}
        <div className="h-16 w-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
          <Radio size={32} className="text-white" />
        </div>

        {status === 'verifying' && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <Loader2 className="animate-spin text-indigo-500" size={48} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wider">Verifying Link</h2>
              <p className="text-xs text-gray-500 mt-2">{message}</p>
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-center">
              <div className="h-16 w-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center">
                <ShieldCheck className="text-emerald-400" size={36} />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wider text-emerald-400">Authenticated!</h2>
              <p className="text-xs text-gray-400 mt-2">{message}</p>
              <p className="text-[10px] text-gray-500 mt-4 animate-pulse">Redirecting you to the platform...</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-center">
              <div className="h-16 w-16 bg-red-500/10 border border-red-500/30 rounded-full flex items-center justify-center">
                <ShieldAlert className="text-red-400" size={36} />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-black text-white uppercase tracking-wider text-red-400">Verification Failed</h2>
              <p className="text-xs text-gray-400 mt-2 break-words">{message}</p>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full py-3.5 bg-white hover:bg-gray-200 text-black rounded-xl font-extrabold text-xs shadow-lg transition flex items-center justify-center gap-2 mt-4"
            >
              Back to Sign In <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#000000] relative px-4 overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none"></div>
      
      <Suspense fallback={
        <div className="w-full max-w-md glass-card rounded-3xl p-8 relative border border-white/5 shadow-2xl flex flex-col items-center justify-center">
          <Loader2 className="animate-spin text-white mb-4" size={32} />
          <p className="text-xs text-gray-400">Loading verification details...</p>
        </div>
      }>
        <VerifyLoginContent />
      </Suspense>
    </div>
  );
}
