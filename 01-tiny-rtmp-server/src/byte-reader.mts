export default class ByteReader {
  private buffer: Buffer;
  private offset = 0;

  public constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  public isEOF(): boolean {
    return this.offset >= this.buffer.byteLength;
  }

  public read(length?: number): Buffer {
    length = Math.max(0, length ?? (this.buffer.byteLength - this.offset));
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  public readUIntBE(length: number): number {
    return this.read(length).readUIntBE(0, length);
  }

  public readIntBE(length: number): number {
    return this.read(length).readIntBE(0, length);
  }

  public readU8(): number {
    return this.readUIntBE(1);
  }

  public readU16BE(): number {
    return this.readUIntBE(2);
  }

  public readU24BE(): number {
    return this.readUIntBE(3);
  }

  public readU32BE(): number {
    return this.readUIntBE(4);
  }

  public readI8(): number {
    return this.readIntBE(1);
  }

  public readI16BE(): number {
    return this.readIntBE(2);
  }

  public readI24BE(): number {
    return this.readIntBE(3);
  }

  public readI32BE(): number {
    return this.readIntBE(4);
  }

  public readF32BE(): number {
    return this.read(4).readFloatBE(0);
  }

  public readF64BE(): number {
    return this.read(8).readDoubleBE(0);
  }
}
