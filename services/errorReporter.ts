/**
 * Error Reporter - sends frontend errors to BFF /api/error
 * for server-side logging and debugging.
 */

import { BFF_URL } from '../constants/api';
import { Platform } from 'react-native';
import { analytics } from './analyticsService';

const ERROR_ENDPOINT = `${BFF_URL}/api/error`;
const MAX_QUEUE = 20;
const FLUSH_INTERVAL_MS = 5000;

interface ErrorEntry {
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: string;
  userAgent: string;
  sessionId: string;
}

class ErrorReporter {
  private queue: ErrorEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.timer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  report(error: string | Error, context?: Record<string, unknown>): void {
    const entry: ErrorEntry = {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 1000) : undefined,
      context,
      timestamp: new Date().toISOString(),
      userAgent: `${Platform.OS}/${Platform.Version}`,
      sessionId: analytics.getSessionId(),
    };

    console.error(`[ErrorReporter] ${entry.error}`, context);
    analytics.trackError(error, context, typeof context?.requestId === 'string' ? context.requestId : undefined);

    this.queue.push(entry);
    if (this.queue.length > MAX_QUEUE) {
      this.queue.shift();
    }

    if (this.queue.length >= 5) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    for (const entry of batch) {
      try {
        await fetch(ERROR_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': entry.sessionId,
          },
          body: JSON.stringify(entry),
        });
      } catch {
        // Silently fail - don't recurse
      }
    }
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const errorReporter = new ErrorReporter();
