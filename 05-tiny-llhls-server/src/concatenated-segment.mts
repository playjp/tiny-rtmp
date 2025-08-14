import Segment from './segment.mts';

export default class ConcatenatedSegment extends Segment {
  private parts: Segment[] = [];

  public constructor(timestamp: number, pdt?: Date) {
    super(timestamp, pdt);
    this.parts.push(new Segment(timestamp));
  }

  public latestBegin(): number {
    return this.parts[this.parts.length - 1].begin();
  }

  public partialComplete(timestamp: number): void {
    const part = this.parts[this.parts.length - 1];
    this.parts.push(new Segment(timestamp));
    part.complete(timestamp);
  }

  public feed(buffer: Buffer, keyframe: boolean = false): void {
    const part = this.parts[this.parts.length - 1];
    if (part) { part.feed(buffer, keyframe); }
    super.feed(buffer, keyframe);
  }

  public complete(timestamp: number, notify: boolean = true): void {
    if (this.extinf() != null) { return; }
    const part = this.parts[this.parts.length - 1];
    if (part) { part.complete(timestamp, false); }
    super.complete(timestamp, false);
    if (!notify) { return; }
    this.notify();
  }

  public notify(): void {
    const part = this.parts[this.parts.length - 1];
    if (part) { part.notify(); }
    super.notify();
  }

  public partial(index: number): Segment | undefined {
    return this.parts[index];
  }

  public *enumerate(): Iterable<[index: number, partialSegment: Segment]> {
    for (let i = 0; i < this.parts.length; i++) {
      yield [i, this.parts[i]];
    }
  }
}
