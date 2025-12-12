import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';

export default class BitReader {
  protected bits: number = 0;
  protected bits_offset: number = 8;

  protected reader: ByteReader;
  protected consumed: number = 0;

  public constructor(data: Buffer) {
    this.reader = new ByteReader(data);
  }

  public isEOF(): boolean {
    return this.reader.isEOF() && this.bits_offset >= 8;
  }

  public consumedBits(): number {
    return this.consumed;
  }

  protected fill(): void {
    this.bits = this.reader.readU8();
    this.bits_offset = 0;
  }

  private shift(): number {
    while (!this.isEOF() && this.bits_offset >= 8) { this.fill(); }
    if (this.isEOF()) { throw new Error('EOF Exception'); }
    const bit = (this.bits & (1 << (7 - this.bits_offset))) !== 0 ? 1 : 0;
    this.bits_offset += 1;
    this.consumed += 1;
    return bit;
  }

  public skipBits(length: number): void {
    while (length > 0) {
      this.shift();
      length -= 1;
    }
  }

  public skipByteAlign(): void {
    while (!this.isByteAligned()) {
      this.shift();
    }
  }

  public isByteAligned(): boolean {
    return (this.bits_offset % 8) === 0;
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

  public skipUEG(): void {
    this.readUEG();
  }

  public readSEG(): number {
    const ueg = this.readUEG();
    if (ueg === 0) { return 0; }
    return ueg % 2 === 0 ? -(ueg / 2) : (ueg + 1) / 2;
  }

  public skipSEG(): void {
    this.readSEG();
  }
}
