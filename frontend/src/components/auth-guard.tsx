'use client';

import { useEffect, type ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  getServerSnapshot,
  getSnapshot,
  restoreSession,
  subscribe,
} from '@/lib/auth';

export function useSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * For guest-only pages (login/register): restore any existing cookie session
 * and bounce the visitor to `target` when one turns out to be valid.
 * Returns the current session status so the page can show a checking state.
 */
export function useGuestRedirect(target = '/account') {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(target);
    }
  }, [status, router, target]);

  return status;
}

/**
 * Client-side guard for protected pages. It only improves UX by redirecting
 * signed-out visitors — the backend remains the authority for every request.
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm font-medium text-secondary">Checking session…</p>
      </main>
    );
  }

  return <>{children}</>;
}
