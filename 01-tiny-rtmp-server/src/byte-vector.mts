export default class ByteVector {
  private buffer: Buffer;
  private length = 0;

  public constructor(capacity?: number) {
    this.buffer = Buffer.alloc(capacity ?? 64);
  }

  public static from(buffer: Buffer): ByteVector {
    const vector = new ByteVector(buffer.byteLength);
    vector.write(buffer);
    return vector;
  }

  private extend(desired: number): void {
    let capacity = this.buffer.byteLength;
    while (capacity < desired) {
      capacity *= 2;
    }
    if (capacity !== this.buffer.byteLength) {
      const extended = Buffer.alloc(capacity);
      extended.set(this.buffer.subarray(0, this.length));
      this.buffer = extended;
    }
  }

  public write(buffer: Buffer, position?: number): void {
    position ??= this.length;
    this.extend(position + buffer.byteLength);
    this.buffer.set(buffer, position);
    this.length = Math.max(this.length, position + buffer.byteLength);
  }

  public writeUIntBE(value: number, length: number, position?: number): void {
    position ??= this.length;
    this.extend(position + length);
    this.buffer.writeUIntBE(value, position, length);
    this.length = Math.max(this.length, position + length);
  }

  public writeIntBE(value: number, length: number, position?: number): void {
    position ??= this.length;
    this.extend(position + length);
    this.buffer.writeIntBE(value, position, length);
    this.length = Math.max(this.length, position + length);
  }

  public writeUIntLE(value: number, length: number, position?: number): void {
    position ??= this.length;
    this.extend(position + length);
    this.buffer.writeUIntLE(value, position, length);
    this.length = Math.max(this.length, position + length);
  }

  public writeIntLE(value: number, length: number, position?: number): void {
    position ??= this.length;
    this.extend(position + length);
    this.buffer.writeIntLE(value, position, length);
    this.length = Math.max(this.length, position + length);
  }

  public writeU8(value: number, position?: number) {
    this.writeUIntBE(value, 1, position);
  }

  public writeU16BE(value: number, position?: number) {
    this.writeUIntBE(value, 2, position);
  }

  public writeU24BE(value: number, position?: number) {
    this.writeUIntBE(value, 3, position);
  }

  public writeU32BE(value: number, position?: number) {
    this.writeUIntBE(value, 4, position);
  }

  public writeU16LE(value: number, position?: number) {
    this.writeUIntLE(value, 2, position);
  }

  public writeU24LE(value: number, position?: number) {
    this.writeUIntLE(value, 3, position);
  }

  public writeU32LE(value: number, position?: number) {
    this.writeUIntLE(value, 4, position);
  }

  public writeI8(value: number, position?: number) {
    this.writeIntBE(value, 1, position);
  }

  public writeI16BE(value: number, position?: number) {
    this.writeIntBE(value, 2, position);
  }

  public writeI24BE(value: number, position?: number) {
    this.writeIntBE(value, 3, position);
  }

  public writeI32BE(value: number, position?: number) {
    this.writeIntBE(value, 4, position);
  }

  public writeI16LE(value: number, position?: number) {
    this.writeIntLE(value, 2, position);
  }

  public writeI24LE(value: number, position?: number) {
    this.writeIntLE(value, 3, position);
  }

  public writeI32LE(value: number, position?: number) {
    this.writeIntLE(value, 4, position);
  }

  public writeF32BE(float: number, position?: number): void {
    position ??= this.length;
    this.extend(position + 4);
    this.buffer.writeFloatBE(float, position);
    this.length = Math.max(this.length, position + 4);
  }

  public writeF64BE(double: number, position?: number): void {
    position ??= this.length;
    this.extend(position + 8);
    this.buffer.writeDoubleBE(double, position);
    this.length = Math.max(this.length, position + 8);
  }

  public writeF32LE(float: number, position?: number): void {
    position ??= this.length;
    this.extend(position + 4);
    this.buffer.writeFloatLE(float, position);
    this.length = Math.max(this.length, position + 4);
  }

  public writeF64LE(double: number, position?: number): void {
    position ??= this.length;
    this.extend(position + 8);
    this.buffer.writeDoubleLE(double, position);
    this.length = Math.max(this.length, position + 8);
  }

  public byteLength(): number {
    return this.length;
  }

  public build(): Buffer {
    return this.buffer.subarray(0, this.length);
  }
}
