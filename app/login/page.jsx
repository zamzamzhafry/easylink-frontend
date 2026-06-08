'use client';

import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Lock, UserCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';
import { requestJson } from '@/lib/request-json';
import { resetSessionCache, fetchAuthSession } from '@/hooks/use-auth-session';
import { useAppLocale } from '@/components/app-shell';
import { getUIText } from '@/lib/localization/ui-texts';

export default function LoginPage() {
  const router = useRouter();
  const { warning, success } = useToast();
  const { locale } = useAppLocale();
  const resolvedLocale = locale === 'id' ? 'id' : 'en';
  const t = useCallback((path) => getUIText(path, resolvedLocale), [resolvedLocale]);
  const [loginId, setLoginId] = useState('');
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
    fetchAuthSession()
      .then((session) => {
        if (!mounted) return;
        if (session?.user) router.replace(nextPath);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [nextPath, router]);

  const login = async (event) => {
    event.preventDefault();
    if (!loginId.trim()) {
      warning('Login ID is required.', 'Login failed');
      return;
    }

    setLoading(true);
    try {
      await requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login_id: loginId.trim(), password }),
      });
      success('Login success.', 'Authenticated');
      resetSessionCache();
      router.refresh();
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
          <h1 className="text-2xl font-bold text-foreground">{t('loginPage.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('loginPage.subtitle')}</p>
        </div>

        <form onSubmit={login} className="space-y-4">
          <div>
            <label htmlFor="login-id" className="auth-label mb-1 block text-xs">
              {t('loginPage.loginIdLabel')}
            </label>
            <div className="relative">
              <UserCircle2 className="auth-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder={t('loginPage.loginIdPlaceholder')}
                id="login-id"
                className="auth-input w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm transition-colors focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="auth-label mb-1 block text-xs">
              {t('loginPage.passwordLabel')}
            </label>
            <div className="relative">
              <Lock className="auth-input-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('loginPage.passwordPlaceholder')}
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
            {loading ? t('loginPage.signingIn') : t('loginPage.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
