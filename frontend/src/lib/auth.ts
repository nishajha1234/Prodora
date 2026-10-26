export interface SessionUser {
  id: string;
  uuid: string;
  email: string;
  displayName: string;
  roleCode: string;
}

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
}

export class AuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const SERVER_STATE: SessionState = { status: 'loading', user: null };

// The access token lives ONLY in this module's memory. It is never written to
// localStorage/sessionStorage/cookies — only the HttpOnly refresh cookie keeps
// the session alive across reloads, and JavaScript cannot read it.
let accessToken: string | null = null;
let state: SessionState = { ...SERVER_STATE };
const listeners = new Set<() => void>();

function setState(patch: Partial<SessionState>): void {
  if (
    (patch.status ?? state.status) === state.status &&
    (patch.user === undefined ? state.user : patch.user) === state.user
  ) {
    return;
  }
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): SessionState {
  return state;
}

export function getServerSnapshot(): SessionState {
  return SERVER_STATE;
}

function clearSession(): void {
  accessToken = null;
  setState({ status: 'unauthenticated', user: null });
}

async function readError(response: Response): Promise<AuthError> {
  let code = 'UNKNOWN_ERROR';
  let message = 'Something went wrong. Please try again.';
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    if (body.error?.code) code = body.error.code;
    if (body.error?.message) message = body.error.message;
  } catch {
    // Non-JSON body: keep the generic message.
  }
  return new AuthError(code, message, response.status);
}

interface SessionResponse {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
  sessionId: string;
}

/**
 * Restore the session from the HttpOnly refresh cookie. Called on page load
 * for protected routes and whenever the access token is rejected.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      clearSession();
      return false;
    }

    const data = (await response.json()) as SessionResponse;
    accessToken = data.accessToken;
    setState({ status: 'authenticated', user: data.user });
    return true;
  } catch {
    // Network failure: treat as no session so guards behave predictably.
    clearSession();
    return false;
  }
}

/** Restore once per app load; no-op when already signed in. */
export async function restoreSession(): Promise<void> {
  if (state.status === 'authenticated' && accessToken) return;
  setState({ status: 'loading' });
  await refreshSession();
}

export interface AuthRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Authenticated fetch: attaches the in-memory access token, sends cookies,
 * and on a 401 transparently tries one cookie-based refresh before giving up
 * (expired-session handling).
 */
export async function authFetch(
  path: string,
  init: AuthRequestInit = {},
  allowRefresh = true,
): Promise<Response> {
  const headers = new Headers();
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      credentials: 'include',
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new AuthError('NETWORK_ERROR', 'The Prodora API is unreachable.', 0);
  }

  if (response.status === 401 && allowRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return authFetch(path, init, false);
    }
    throw new AuthError(
      'SESSION_EXPIRED',
      'Your session has expired. Please sign in again.',
      401,
    );
  }

  return response;
}

async function submitSession(
  path: string,
  payload: Record<string, unknown>,
): Promise<SessionUser> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AuthError('NETWORK_ERROR', 'The Prodora API is unreachable.', 0);
  }

  if (!response.ok) throw await readError(response);

  const data = (await response.json()) as SessionResponse;
  accessToken = data.accessToken;
  setState({ status: 'authenticated', user: data.user });
  return data.user;
}

export async function login(
  email: string,
  password: string,
): Promise<SessionUser> {
  return submitSession('/auth/login', { email, password });
}

export async function register(input: {
  email: string;
  displayName: string;
  password: string;
}): Promise<SessionUser> {
  return submitSession('/auth/register', input);
}

/** End the session server-side (cookie-only, works with an expired access token). */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Even if the network fails, drop the local session below.
  }
  clearSession();
}

export async function fetchJson<T>(path: string): Promise<T> {
  const response = await authFetch(path);
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}
