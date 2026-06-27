'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Send, Loader2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mockResetLink, setMockResetLink] = useState('');

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email.');
      return;
    }

    setError('');
    setMessage('');
    setMockResetLink('');
    setLoading(true);

    try {
      const res = await fetch(`${backendUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();

      if (data.success) {
        setMessage('Reset link sent to your email.');
        // Fallback testing support when SMTP is not configured
        if (data.mockToken) {
          setMockResetLink(`/reset-password?token=${data.mockToken}&email=${encodeURIComponent(email)}`);
        }
      } else {
        setError(data.message || 'Failed to send reset link.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection to backend failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#030712] relative px-4 overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-md glass-card rounded-3xl p-8 relative glow-primary">
        <Link href="/login" className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white font-bold mb-6 transition">
          <ArrowLeft size={14} /> Back to Sign In
        </Link>

        <div className="mb-6">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Reset Password</h2>
          <p className="text-sm text-gray-400 mt-1">We will send you instructions to change your password</p>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold text-center">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold text-center">
            {message}
          </div>
        )}

        {mockResetLink && (
          <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs text-center flex flex-col gap-2">
            <span className="font-bold">⚠️ SMTP Server Offline Fallback:</span>
            <span>Use this temporary token reset link to complete test password changes:</span>
            <Link href={mockResetLink} className="underline text-indigo-400 hover:text-indigo-300 font-semibold break-all">
              {window.location.origin}{mockResetLink}
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="relative">
            <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full py-3.5 pl-12 pr-4 text-sm rounded-xl glass-input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-indigo-500/20 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <>
                Send Instructions <Send size={14} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
