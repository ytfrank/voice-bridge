/**
 * Analytics Service — voice-bridge V1.6
 * Minimal structured frontend analytics with session/request correlation.
 */

import { Platform } from 'react-native';
import { BFF_URL } from '../constants/api';

export interface AnalyticsEvent {
  timestamp: number;
  sessionId: string;
  requestId?: string;
  event: string;
  payload: Record<string, unknown>;
}

type EventHandler = (event: AnalyticsEvent) => void;

const MAX_QUEUE = 100;
const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_ON_EVENTS = 10;
const STORAGE_KEY = 'vb_analytics_queue';

class AnalyticsService {
  private sessionId: string;
  private seq = 0;
  private queue: AnalyticsEvent[] = [];
  private listeners: EventHandler[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly bffUrl = BFF_URL;

  constructor() {
    this.sessionId = this.generateSessionId();
    void this.loadQueue();
  }

  private generateSessionId(): string {
    const ts = Date.now().toString(36);
    const rnd = Math.random().toString(36).slice(2, 8);
    return `sess_${ts}_${rnd}`;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  resetSession(): string {
    this.sessionId = this.generateSessionId();
    this.seq = 0;
    return this.sessionId;
  }

  nextRequestId(prefix = 'req'): string {
    this.seq += 1;
    return `${prefix}_${Date.now()}_${this.seq}`;
  }

  track(event: string, payload: Record<string, unknown> = {}, requestId?: string): void {
    const entry: AnalyticsEvent = {
      timestamp: Date.now(),
      sessionId: this.sessionId,
      requestId,
      event,
      payload,
    };

    this.queue.push(entry);
    if (this.queue.length > MAX_QUEUE) {
      this.queue = this.queue.slice(-MAX_QUEUE);
    }

    void this.persistQueue();
    this.notifyListeners(entry);

    if (this.queue.length >= FLUSH_ON_EVENTS) {
      void this.flush();
    }
  }

  trackError(error: unknown, context: Record<string, unknown> = {}, requestId?: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.slice(0, 1000) : undefined;

    this.track(
      'error',
      {
        errorMessage,
        stack,
        platform: Platform.OS,
        context,
      },
      requestId
    );
  }

  startFlushCycle(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, FLUSH_INTERVAL_MS);
  }

  stopFlushCycle(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = [...this.queue];
    this.queue = [];
    await this.persistQueue();

    try {
      const res = await fetch(`${this.bffUrl}/api/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': this.sessionId,
        },
        body: JSON.stringify({ sessionId: this.sessionId, events: batch }),
      });

      if (!res.ok) {
        this.requeue(batch);
        console.warn('[Analytics] flush failed, re-queued', batch.length, 'events');
      }
    } catch (error) {
      this.requeue(batch);
      console.warn('[Analytics] flush error, re-queued:', error);
    }
  }

  subscribe(listener: EventHandler): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener);
    };
  }

  getRecent(n = 30): AnalyticsEvent[] {
    return this.queue.slice(-n);
  }

  private requeue(batch: AnalyticsEvent[]): void {
    this.queue = [...batch, ...this.queue].slice(-MAX_QUEUE);
    void this.persistQueue();
  }

  private async loadQueue(): Promise<void> {
    try {
      const storage = this.getStorage();
      if (!storage) return;
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) {
        this.queue = JSON.parse(raw) as AnalyticsEvent[];
      }
    } catch {
      this.queue = [];
    }
  }

  private async persistQueue(): Promise<void> {
    try {
      const storage = this.getStorage();
      if (!storage) return;
      await storage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      this.queue = this.queue.slice(-20);
    }
  }

  private getStorage(): { getItem: (key: string) => Promise<string | null> | string | null; setItem: (key: string, value: string) => Promise<void> | void } | null {
    const maybeStorage = (globalThis as typeof globalThis & {
      localStorage?: {
        getItem: (key: string) => string | null;
        setItem: (key: string, value: string) => void;
      };
    }).localStorage;

    if (!maybeStorage) return null;
    return maybeStorage;
  }

  private notifyListeners(entry: AnalyticsEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // debug listeners must never break main flow
      }
    }
  }
}

export const analytics = new AnalyticsService();
