'use client';

import { useEffect, useState } from 'react';
import { AuthGuard, useSession } from '@/components/auth-guard';
import {
  AuthError,
  authFetch,
  fetchJson,
  logout as logoutRequest,
} from '@/lib/auth';
import { useRouter } from 'next/navigation';

interface SessionSummary {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
}

function AccountContent() {
  const { user } = useSession();
  const router = useRouter();

  const [permissions, setPermissions] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [perms, sess] = await Promise.all([
        fetchJson<{ permissions: string[] }>('/auth/permissions'),
        fetchJson<{ sessions: SessionSummary[] }>('/auth/sessions'),
      ]);
      setPermissions(perms.permissions);
      setSessions(sess.sessions);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof AuthError
          ? caught.message
          : 'Could not load your account.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    document.title = 'Account · Prodora';
    let active = true;
    void Promise.all([
      fetchJson<{ permissions: string[] }>('/auth/permissions'),
      fetchJson<{ sessions: SessionSummary[] }>('/auth/sessions'),
    ])
      .then(([perms, sess]) => {
        if (!active) return;
        setPermissions(perms.permissions);
        setSessions(sess.sessions);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(
          caught instanceof AuthError
            ? caught.message
            : 'Could not load your account.',
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleRevoke(sessionId: string) {
    setError(null);
    try {
      const response = await authFetch('/auth/revoke', {
        method: 'POST',
        body: { sessionId },
      });
      if (!response.ok) {
        throw new AuthError(
          'REVOKE_FAILED',
          'Could not revoke the session.',
          response.status,
        );
      }
      await load();
    } catch (caught) {
      setError(
        caught instanceof AuthError
          ? caught.message
          : 'Could not revoke the session.',
      );
    }
  }

  async function handleLogout() {
    await logoutRequest();
    router.replace('/login');
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
            Prodora
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-heading">
            Your account
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-lg border border-default bg-card px-4 py-2 text-sm font-semibold text-body transition hover:bg-secondary-surface"
        >
          Sign out
        </button>
      </header>

      <section className="mt-6 rounded-2xl border border-default bg-card p-6">
        <h2 className="text-lg font-semibold text-heading">Profile</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
              Display name
            </dt>
            <dd className="mt-1 text-sm text-body">
              {user?.displayName ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
              Email
            </dt>
            <dd className="mt-1 text-sm text-body">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
              Role
            </dt>
            <dd className="mt-1">
              <span className="rounded-full border border-primary-border bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
                {user?.roleCode ?? '—'}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
              Account ID
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-secondary">
              {user?.uuid ?? '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl border border-default bg-card p-6">
        <h2 className="text-lg font-semibold text-heading">Permissions</h2>
        {loading ? (
          <p className="mt-3 text-sm text-secondary">Loading…</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {permissions.map((permission) => (
              <li
                key={permission}
                className="rounded-full border border-default bg-secondary-surface px-2.5 py-1 font-mono text-xs text-body"
              >
                {permission}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-default bg-card p-6">
        <h2 className="text-lg font-semibold text-heading">Active sessions</h2>
        {loading ? (
          <p className="mt-3 text-sm text-secondary">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-divider">
            {sessions.map((session) => (
              <li
                key={session.sessionId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="break-all font-mono text-xs text-secondary">
                    {session.sessionId}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Started {new Date(session.createdAt).toLocaleString()} ·
                    expires {new Date(session.expiresAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevoke(session.sessionId)}
                  className="rounded-lg border border-error/40 bg-error-soft px-3 py-1.5 text-xs font-semibold text-error transition hover:bg-error hover:text-white"
                >
                  Revoke
                </button>
              </li>
            ))}
            {sessions.length === 0 ? (
              <li className="py-3 text-sm text-secondary">
                No active sessions.
              </li>
            ) : null}
          </ul>
        )}
      </section>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-error/30 bg-error-soft px-3 py-2 text-sm text-error"
        >
          {error}
        </p>
      ) : null}
    </main>
  );
}

export default function AccountPage() {
  return (
    <AuthGuard>
      <AccountContent />
    </AuthGuard>
  );
}
