import { Writable } from 'node:stream';

export default class Segment {
  private beginTimestamp: number;
  private endTimestamp: number | null = null;
  private media: Buffer[] = [];

  public constructor(timestamp: number) {
    this.beginTimestamp = timestamp;
  }

  public begin(): number {
    return this.beginTimestamp;
  }

  public extinf(): number | null {
    if (this.endTimestamp == null) { return null; }
    return this.endTimestamp - this.beginTimestamp;
  }

  public write(writable: Writable): void {
    if (this.extinf() != null) {
      for (const data of this.media) {
        writable.write(data);
      }
    }

    writable.end();
    return;
  }

  public feed(data: Buffer): void {
    this.media.push(data);
  }

  public complete(timestamp: number): void {
    if (this.extinf() != null) { return; }
    this.endTimestamp = timestamp;
  }
}
