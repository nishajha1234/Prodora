'use client';

import { useEffect, useState } from 'react';
import { getApiHealth } from '@/lib/api';

type Status = 'checking' | 'available' | 'unavailable';

export function ApiStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    const controller = new AbortController();

    getApiHealth(controller.signal)
      .then(() => setStatus('available'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('unavailable');
      });

    return () => controller.abort();
  }, []);

  const labels: Record<Status, string> = {
    checking: 'Checking API connection…',
    available: 'API foundation is available',
    unavailable: 'API is currently unavailable',
  };

  return (
    <div className="flex items-center gap-3" role="status" aria-live="polite">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          status === 'available'
            ? 'bg-success'
            : status === 'unavailable'
              ? 'bg-error'
              : 'animate-pulse bg-info'
        }`}
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-body">{labels[status]}</span>
    </div>
  );
}
