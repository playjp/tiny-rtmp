import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';

export default class BitReader {
  private bits: number[];
  private reader: ByteReader;

  public constructor(data: Buffer) {
    this.bits = [];
    this.reader = new ByteReader(data);
  }

  public isEOF(): boolean {
    return this.reader.isEOF() && this.bits.length === 0;
  }

  private fill(): void {
    const byte = this.reader.readU8();
    for (let i = 7; i >= 0; i--) {
      this.bits.push((byte >> i) & 1);
    }
  }

  private shift(): number {
    if (this.isEOF()) { throw new Error('EOF Exception'); }
    if (this.bits.length === 0) { this.fill(); }
    return this.bits.shift()!;
  }

  public skipBits(length: number): void {
    while (length > 0) {
      this.shift();
      length -= 1;
    }
  }

  public skipByteAlign(): void {
    while ((this.bits.length % 8) !== 0) {
      this.shift();
    }
  }

  public isByteAligned(): boolean {
    return (this.bits.length % 8) === 0;
  }

  public readBits(length: number): number {
    let bits = 0;
    while (length > 0) {
      bits = bits * 2 + this.shift();
      length -= 1;
    }
    return bits;
  }

  public readBool(): boolean {
    return this.readBits(1) === 1;
  }

  public skipBool(): void {
    this.skipBits(1);
  }

  public readUEG(): number {
    let lz = 0;
    while (this.readBits(1) === 0) { lz++; }
    return ((2 ** lz) - 1) + this.readBits(lz);
  }

  public readSEG(): number {
    const ueg = this.readUEG();
    if (ueg === 0) { return 0; }
    return ueg % 2 === 0 ? -(ueg / 2) : (ueg + 1) / 2;
  }
}
