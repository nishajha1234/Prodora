export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function getApiHealth(signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${API_URL}/health`, {
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error('The Prodora API is unavailable.');
  }
}
