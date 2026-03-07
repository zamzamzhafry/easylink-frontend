'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, Lock, UserCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';

export default function LoginPage() {
  const router = useRouter();
  const { warning, success } = useToast();
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState('/');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') || '/';
    setNextPath(next);
  }, []);

  useEffect(() => {
    let mounted = true;
    requestJson('/api/auth/me')
      .then(() => {
        if (!mounted) return;
        router.replace(nextPath);
      })
      .catch(() => {
        // not logged in
      });
    return () => {
      mounted = false;
    };
  }, [nextPath, router]);

  const login = async (event) => {
    event.preventDefault();
    if (!pin.trim()) {
      warning('PIN is required.', 'Login failed');
      return;
    }

    setLoading(true);
    try {
      await requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim(), password }),
      });
      success('Login success.', 'Authenticated');
      router.replace(nextPath);
    } catch (error) {
      warning(error.message || 'Unable to login with provided credentials.', 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(45,212,191,0.16),transparent_40%),radial-gradient(circle_at_75%_80%,rgba(14,165,233,0.14),transparent_40%)]" />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
            <Fingerprint className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-white">EasyLink Login</h1>
          <p className="mt-1 text-sm text-slate-400">Use your device user PIN and password.</p>
        </div>

        <form onSubmit={login} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-400">PIN</label>
            <div className="relative">
              <UserCircle2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="e.g. 1001"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-3 text-sm text-white transition-colors focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-slate-400">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Device password"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 py-2.5 pl-10 pr-3 text-sm text-white transition-colors focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-teal-400 disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
