import { Writable } from 'node:stream';

export default class Segment {
  private timescale: number;
  private beginTimestamp: number;
  private endTimestamp: number | null = null;
  private buffers: Buffer[] = [];
  private combine: Buffer | null = null;

  private keyframe: boolean = false;
  private pdt: Date | null = null;

  private writables: Writable[] = [];
  private endHandlers: (() => void)[] = [];

  public constructor(timestamp: number, timescale: number, pdt?: Date) {
    this.timescale = timescale;
    this.beginTimestamp = timestamp;
    this.pdt = pdt ?? null;
  }

  public begin(): number {
    return this.beginTimestamp;
  }

  public programDateTime(): Date | null {
    return this.pdt;
  }

  public extinf(): number | null {
    if (this.endTimestamp == null) { return null; }
    return (this.endTimestamp - this.beginTimestamp) / this.timescale;
  }

  public duration(): number | null {
    if (this.endTimestamp == null) { return null; }
    return this.endTimestamp - this.beginTimestamp;
  }

  public attach(writable: Writable): void {
    if (this.extinf() != null) {
      writable.write(this.combine!);
      writable.end();
      return;
    }

    for (const buffer of this.buffers) {
      writable.write(buffer);
    }
    this.writables.push(writable);
  }

  public promise(): Promise<void> {
    if (this.extinf() != null) { return Promise.resolve(); }
    const { promise, resolve } = Promise.withResolvers<void>();
    this.endHandlers.push(resolve);
    return promise;
  }

  public feed(data: Buffer, keyframe: boolean = false): void {
    this.buffers.push(data);
    for (const writable of this.writables) {
      writable.write(data);
    }
    this.keyframe ||= keyframe;
  }

  public complete(timestamp: number, notify: boolean = true): void {
    if (this.extinf() != null) { return; }
    this.endTimestamp = timestamp;
    this.combine = Buffer.concat(this.buffers);
    for (const writable of this.writables) {
      writable.end();
    }
    this.writables = [];
    if (!notify) { return; }
    this.notify();
  }

  public notify(): void {
    if (this.extinf() == null) { return; }
    for (const end of this.endHandlers) { end(); }
    this.endHandlers = [];
  }

  public independent(): boolean {
    return this.keyframe;
  }
}
