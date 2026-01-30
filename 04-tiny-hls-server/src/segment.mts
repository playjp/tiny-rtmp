export default class Segment {
  private timescale: number;
  private beginTimestamp: number;
  private endTimestamp: number | null = null;
  private media: Buffer[] = [];

  public constructor(timestamp: number, timescale: number) {
    this.beginTimestamp = timestamp;
    this.timescale = timescale;
  }

  public begin(): number {
    return this.beginTimestamp;
  }

  public extinf(): number | null {
    if (this.endTimestamp == null) { return null; }
    return (this.endTimestamp - this.beginTimestamp) / this.timescale;
  }

  public duration(): number | null {
    if (this.endTimestamp == null) { return null; }
    return this.endTimestamp - this.beginTimestamp;
  }

  public segment(): Buffer | null {
    if (this.extinf() == null) { return null; }
    return Buffer.concat(this.media);
  }

  public feed(data: Buffer): void {
    this.media.push(data);
  }

  public complete(timestamp: number): void {
    if (this.extinf() != null) { return; }
    this.endTimestamp = timestamp;
  }
}
