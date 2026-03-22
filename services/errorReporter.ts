/**
 * Error Reporter - sends frontend errors to BFF /api/error
 * for server-side logging and debugging.
 */

import { API, BFF_URL } from '../constants/api';
import { Platform } from 'react-native';

const ERROR_ENDPOINT = `${BFF_URL}/api/error`;
const MAX_QUEUE = 20;
const FLUSH_INTERVAL_MS = 5000;

interface ErrorEntry {
  error: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: string;
  userAgent: string;
}

class ErrorReporter {
  private queue: ErrorEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Auto-flush every 5s
    this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  /**
   * Report an error to the server
   */
  report(error: string | Error, context?: Record<string, unknown>): void {
    const entry: ErrorEntry = {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.substring(0, 1000) : undefined,
      context,
      timestamp: new Date().toISOString(),
      userAgent: `${Platform.OS}/${Platform.Version}`,
    };

    console.error(`[ErrorReporter] ${entry.error}`, context);

    this.queue.push(entry);
    if (this.queue.length > MAX_QUEUE) {
      this.queue.shift();
    }

    // Immediate flush for critical errors
    if (this.queue.length >= 5) {
      this.flush();
    }
  }

  /**
   * Flush queued errors to server
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];

    for (const entry of batch) {
      try {
        await fetch(ERROR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
