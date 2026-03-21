/**
 * Ordered Chunk Queue
 * Processes audio chunks strictly in segmentId order.
 * Prevents out-of-order transcription results.
 *
 * Timeout set to 15s to accommodate: upload (~1-2s) + tunnel latency (~2-3s) + ASR (~0.5-2s)
 * Previous 5s timeout caused P0 production blocking (all chunks timed out via tunnel).
 */

const CHUNK_TIMEOUT_MS = 15000;

interface QueueItem {
  segmentId: number;
  uri: string;
}

export class OrderedChunkQueue {
  private queue: QueueItem[] = [];
  private processing = false;
  private nextExpected = 0;
  private onProcess: (segmentId: number, uri: string) => Promise<void>;

  constructor(onProcess: (segmentId: number, uri: string) => Promise<void>) {
    this.onProcess = onProcess;
  }

  enqueue(segmentId: number, uri: string): void {
    this.queue.push({ segmentId, uri });
    this.queue.sort((a, b) => a.segmentId - b.segmentId);
    this.drain();
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];

      // Only process the next expected segment
      if (item.segmentId !== this.nextExpected) {
        break;
      }

      this.queue.shift();

      const t0 = Date.now();
      try {
        // Process with timeout
        await Promise.race([
          this.onProcess(item.segmentId, item.uri),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error(`Chunk ${item.segmentId} timeout (${CHUNK_TIMEOUT_MS}ms)`)), CHUNK_TIMEOUT_MS)
          ),
        ]);
        console.log(`[Queue] segment ${item.segmentId} done in ${Date.now() - t0}ms`);
      } catch (err) {
        console.error(`[Queue] segment ${item.segmentId} failed after ${Date.now() - t0}ms:`, err);
        // Skip failed chunk, continue with next
      }

      this.nextExpected++;
    }

    this.processing = false;
  }

  reset(): void {
    this.queue = [];
    this.processing = false;
    this.nextExpected = 0;
  }

  getPendingCount(): number {
    return this.queue.length;
  }
}
