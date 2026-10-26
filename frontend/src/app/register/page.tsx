'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthError, register } from '@/lib/auth';
import { useGuestRedirect } from '@/components/auth-guard';

export default function RegisterPage() {
  const router = useRouter();
  const status = useGuestRedirect();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Create account · Prodora';
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ email, displayName, password });
      router.replace('/account');
    } catch (caught) {
      setError(
        caught instanceof AuthError
          ? caught.message
          : 'Something went wrong. Please try again.',
      );
      setSubmitting(false);
    }
  }

  if (status !== 'unauthenticated') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-sm font-medium text-secondary">Checking session…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-default bg-card p-8 shadow-[0_18px_60px_rgba(37,33,34,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
          Prodora
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-heading">
          Create your account
        </h1>
        <p className="mt-2 text-sm leading-6 text-secondary">
          Register to start managing your product lifecycle records.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              className="mb-1 block text-sm font-medium text-body"
              htmlFor="displayName"
            >
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              required
              autoComplete="name"
              maxLength={120}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-lg border border-default bg-white px-3 py-2 text-sm text-body focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              placeholder="Your name"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-medium text-body"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-default bg-white px-3 py-2 text-sm text-body focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              className="mb-1 block text-sm font-medium text-body"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-default bg-white px-3 py-2 text-sm text-body focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-soft"
              placeholder="At least 12 characters"
            />
            <p className="mt-1 text-xs text-muted">Minimum 12 characters.</p>
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-error/30 bg-error-soft px-3 py-2 text-sm text-error"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-secondary">
          Already have an account?{' '}
          <Link
            className="font-semibold text-primary hover:underline"
            href="/login"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
