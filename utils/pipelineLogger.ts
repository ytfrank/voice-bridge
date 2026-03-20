/**
 * Pipeline Logger
 * Records segment-level events for debugging and latency analysis.
 */

export type PipelineEvent =
  | 'chunk_recorded'
  | 'asr_start'
  | 'asr_done'
  | 'translate_start'
  | 'translate_done'
  | 'error';

interface PipelineLog {
  segmentId: number;
  event: PipelineEvent;
  timestamp: number;
  data?: any;
}

class PipelineLogger {
  private logs: PipelineLog[] = [];
  private maxLogs = 500;

  log(segmentId: number, event: PipelineEvent, data?: any): void {
    const entry: PipelineLog = { segmentId, event, timestamp: Date.now(), data };
    this.logs.push(entry);

    // Cap memory usage
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    console.log(`[Pipeline] seg:${segmentId} ${event}`, data || '');
  }

  getRecent(n = 50): PipelineLog[] {
    return this.logs.slice(-n);
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
