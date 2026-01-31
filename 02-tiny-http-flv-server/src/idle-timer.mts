import { setTimeout, clearTimeout } from 'node:timers';

export default class IdleTimer {
  private timeoutId: NodeJS.Timeout | null = null;
  private timeout: number;
  private handler: () => void;

  public constructor(handler: () => void, timeout?: number) {
    this.timeout = timeout ?? Number.POSITIVE_INFINITY;
    this.timeoutId = null;
    this.handler = handler;
    if (!Number.isFinite(this.timeout)) { return; }
    this.timeoutId = setTimeout(this.handler, this.timeout);
  }

  public tick() {
    if (this.timeoutId != null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (!Number.isFinite(this.timeout)) { return; }
    this.timeoutId = setTimeout(this.handler, this.timeout);
  }

  public destroy(): void {
    if (this.timeoutId == null) { return; }
    clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }
  public [Symbol.dispose](): void {
    this.destroy();
  }
}
