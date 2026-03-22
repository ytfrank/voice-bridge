/**
 * Recording State Machine
 * Manages recording lifecycle with strict state transitions and retry logic.
 */

export enum RecordingState {
  IDLE = 'idle',
  PREPARING = 'preparing',
  RECORDING = 'recording',
  STOPPING = 'stopping',
  ERROR = 'error',
}

const VALID_TRANSITIONS: Record<RecordingState, RecordingState[]> = {
  [RecordingState.IDLE]: [RecordingState.PREPARING],
  [RecordingState.PREPARING]: [RecordingState.RECORDING, RecordingState.ERROR],
  [RecordingState.RECORDING]: [RecordingState.STOPPING, RecordingState.ERROR],
  [RecordingState.STOPPING]: [RecordingState.PREPARING, RecordingState.IDLE, RecordingState.ERROR],
  [RecordingState.ERROR]: [RecordingState.PREPARING, RecordingState.IDLE],
};

export class RecordingStateMachine {
  private state: RecordingState = RecordingState.IDLE;
  private retryCount = 0;
  private maxRetries: number;
  private onStateChange?: (state: RecordingState) => void;

  constructor(maxRetries = 3, onStateChange?: (state: RecordingState) => void) {
    this.maxRetries = maxRetries;
    this.onStateChange = onStateChange;
  }

  getState(): RecordingState {
    return this.state;
  }

  transition(to: RecordingState): boolean {
    const valid = VALID_TRANSITIONS[this.state];
    if (!valid || !valid.includes(to)) {
      console.warn(`[RecSM] Invalid transition: ${this.state} → ${to}`);
      return false;
    }
    console.log(`[RecSM] ${this.state} → ${to}`);
    this.state = to;
    if (to === RecordingState.ERROR) {
      this.retryCount++;
    }
    if (to === RecordingState.RECORDING) {
      this.retryCount = 0;
    }
    this.onStateChange?.(to);
    return true;
  }

  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  isRecording(): boolean {
    return this.state === RecordingState.RECORDING;
  }

  isIdle(): boolean {
    return this.state === RecordingState.IDLE;
  }

  getRetryCount(): number {
    return this.retryCount;
  }

  reset(): void {
    this.state = RecordingState.IDLE;
    this.retryCount = 0;
    this.onStateChange?.(RecordingState.IDLE);
  }
}
