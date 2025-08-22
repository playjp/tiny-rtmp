export type AsyncByteReaderOption = {
  signal: AbortSignal;
};

export default class AsyncByteReader {
  private buffers: Buffer[] = [];
  private offset = 0;
  private totals = 0;
  private eof = false;
  private promises: [byteLength: number, resolve: (result: Buffer) => void, reject: (error: Error) => void][] = [];
  private signal: AbortSignal | null;

  public constructor(option?: Partial<AsyncByteReaderOption>) {
    this.signal = option?.signal ?? null;
    this.signal?.addEventListener('abort', this.feedEOF.bind(this), { once: true });
  }

  private fulfill(): void {
    while (this.promises.length > 0) {
      const [length, resolve] = this.promises[0];
      if (this.totals < length) { break; }

      const drained = [];
      let remains = length;
      while (this.buffers.length > 0) {
        const buffer = this.buffers[0];
        const capacity = buffer.byteLength - this.offset;

        if (capacity > remains) {
          drained.push(buffer.subarray(this.offset, this.offset + remains));
          this.offset += remains;
          break;
        }

        drained.push(buffer.subarray(this.offset));
        this.buffers.shift();
        this.offset = 0;
        remains -= capacity;
      }

      this.totals -= length;
      resolve(drained.length === 1 ? drained[0] : Buffer.concat(drained));
      this.promises.shift();
    }

    if (!this.eof) { return; }
    while (this.promises.length > 0) {
      const [,,reject] = this.promises[0];
      reject(this.signal?.reason ?? new Error('EOF Exception'));
      this.promises.shift();
    }
  }

  public feed(buffer: Buffer): void {
    if (this.eof) { return; }
    this.buffers.push(buffer);
    this.totals += buffer.byteLength;
    this.fulfill();
  }

  public feedEOF(): void {
    this.eof = true;
    this.fulfill();
  }
  public [Symbol.dispose](): void { this.feedEOF(); }

  public read(size: number): Promise<Buffer> {
    const { promise, resolve, reject } = Promise.withResolvers<Buffer>();
    this.promises.push([size, resolve, reject]);
    this.fulfill();
    return promise;
  }

  public async readUIntBE(length: number): Promise<number> {
    return (await this.read(length)).readUIntBE(0, length);
  }

  public async readUIntLE(length: number): Promise<number> {
    return (await this.read(length)).readUIntLE(0, length);
  }

  public async readIntBE(length: number): Promise<number> {
    return (await this.read(length)).readIntBE(0, length);
  }

  public async readIntLE(length: number): Promise<number> {
    return (await this.read(length)).readIntLE(0, length);
  }

  public readU8(): Promise<number> {
    return this.readUIntBE(1);
  }

  public readU16BE(): Promise<number> {
    return this.readUIntBE(2);
  }

  public readU24BE(): Promise<number> {
    return this.readUIntBE(3);
  }

  public readU32BE(): Promise<number> {
    return this.readUIntBE(4);
  }

  public readU16LE(): Promise<number> {
    return this.readUIntLE(2);
  }

  public readU24LE(): Promise<number> {
    return this.readUIntLE(3);
  }

  public readU32LE(): Promise<number> {
    return this.readUIntLE(4);
  }

  public readI8(): Promise<number> {
    return this.readIntBE(1);
  }

  public readI16BE(): Promise<number> {
    return this.readIntBE(2);
  }

  public readI24BE(): Promise<number> {
    return this.readIntBE(3);
  }

  public readI32BE(): Promise<number> {
    return this.readIntBE(4);
  }

  public readI16LE(): Promise<number> {
    return this.readIntLE(2);
  }

  public readI24LE(): Promise<number> {
    return this.readIntLE(3);
  }

  public readI32LE(): Promise<number> {
    return this.readIntLE(4);
  }

  public async readF32BE(): Promise<number> {
    return (await this.read(4)).readFloatBE(0);
  }

  public async readF64BE(): Promise<number> {
    return (await this.read(8)).readDoubleBE(0);
  }

  public async readF32LE(): Promise<number> {
    return (await this.read(4)).readFloatLE(0);
  }

  public async readF64LE(): Promise<number> {
    return (await this.read(8)).readDoubleLE(0);
  }
}
