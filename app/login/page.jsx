'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, Lock, UserCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';

export default function LoginPage() {
  const router = useRouter();
  const { warning, success } = useToast();
  const [nip, setNip] = useState('');
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
    if (!nip.trim()) {
      warning('NIP is required.', 'Login failed');
      return;
    }

    setLoading(true);
    try {
      await requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nip: nip.trim(), password }),
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
    <div className="auth-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="auth-shell-backdrop absolute inset-0" />
      <div className="auth-card relative w-full max-w-md rounded-2xl border p-6 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <div className="auth-brand-icon mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl">
            <Fingerprint className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">EasyLink Login</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use your employee NIP and password.</p>
        </div>

        <form onSubmit={login} className="space-y-4">
          <div>
            <label htmlFor="login-nip" className="auth-label mb-1 block text-xs">
              NIP
            </label>
            <div className="relative">
              <UserCircle2 className="auth-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                value={nip}
                onChange={(event) => setNip(event.target.value)}
                placeholder="Enter NIP"
                id="login-nip"
                className="auth-input w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm transition-colors focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="auth-label mb-1 block text-xs">
              Password
            </label>
            <div className="relative">
              <Lock className="auth-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Device password"
                id="login-password"
                className="auth-input w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm transition-colors focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-submit w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
