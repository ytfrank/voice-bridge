/**
 * Pipeline Logger
 * Records segment-level events for debugging and latency analysis.
 * Supports UI subscription for real-time debug panel display.
 */

export type PipelineEvent =
  | 'chunk_recorded'
  | 'chunk_skipped'
  | 'asr_start'
  | 'asr_done'
  | 'asr_error'
  | 'asr_empty'
  | 'translate_start'
  | 'translate_done'
  | 'translate_error'
  | 'state_change'
  | 'queue_enqueue'
  | 'queue_timeout'
  | 'recovery_attempt'
  | 'recovery_success'
  | 'recovery_fail'
  | 'env_info'
  | 'error';

export interface PipelineLog {
  segmentId: number;
  event: PipelineEvent;
  timestamp: number;
  data?: any;
}

type LogListener = (log: PipelineLog) => void;

class PipelineLogger {
  private logs: PipelineLog[] = [];
  private maxLogs = 200;
  private listeners: LogListener[] = [];

  log(segmentId: number, event: PipelineEvent, data?: any): void {
    const entry: PipelineLog = { segmentId, event, timestamp: Date.now(), data };
    this.logs.push(entry);

    // Cap memory usage
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console log with emoji for visibility
    const emoji = this.getEmoji(event);
    console.log(`${emoji} [Pipeline] seg:${segmentId} ${event}`, data ? JSON.stringify(data).substring(0, 120) : '');

    // Notify UI listeners
    for (const listener of this.listeners) {
      try { listener(entry); } catch {}
    }
  }

  private getEmoji(event: PipelineEvent): string {
    switch (event) {
      case 'chunk_recorded': return '🎤';
      case 'chunk_skipped': return '⏭️';
      case 'asr_start': return '🔍';
      case 'asr_done': return '✅';
      case 'asr_error': return '❌';
      case 'asr_empty': return '🔇';
      case 'translate_start': return '🌐';
      case 'translate_done': return '✅';
      case 'translate_error': return '❌';
      case 'state_change': return '🔄';
      case 'queue_enqueue': return '📥';
      case 'queue_timeout': return '⏰';
      case 'recovery_attempt': return '🔧';
      case 'recovery_success': return '✅';
      case 'recovery_fail': return '💥';
      case 'env_info': return 'ℹ️';
      case 'error': return '🚨';
      default: return '📋';
    }
  }

  /** Subscribe to new log events (for UI debug panel) */
  subscribe(listener: LogListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  getRecent(n = 30): PipelineLog[] {
    return this.logs.slice(-n);
  }

  /** Format a log entry as a human-readable line */
  formatLog(log: PipelineLog): string {
    const emoji = this.getEmoji(log.event);
    const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
    const seg = log.segmentId >= 0 ? `[${log.segmentId}]` : '';
    const detail = log.data ? ` ${typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}` : '';
    return `${time} ${emoji} ${seg} ${log.event}${detail}`.substring(0, 120);
  }

  getSegmentLatency(segmentId: number): { asr: number; translate: number; total: number } | null {
    const segs = this.logs.filter((l) => l.segmentId === segmentId);
    const recorded = segs.find((l) => l.event === 'chunk_recorded');
    const asrDone = segs.find((l) => l.event === 'asr_done');
    const translateDone = segs.find((l) => l.event === 'translate_done');

    if (!recorded) return null;

    return {
      asr: asrDone ? asrDone.timestamp - recorded.timestamp : -1,
      translate: translateDone
        ? translateDone.timestamp - (asrDone?.timestamp || recorded.timestamp)
        : -1,
      total: (translateDone || asrDone || recorded).timestamp - recorded.timestamp,
    };
  }

  reset(): void {
    this.logs = [];
  }
}

export const pipelineLogger = new PipelineLogger();
