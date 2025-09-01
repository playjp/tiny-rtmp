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
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + buffer.byteLength);
    this.buffer.set(buffer, position);
    this.length = Math.max(this.length, position + buffer.byteLength);
  }

  public writeUIntBE(value: number, length: number, position?: number): void {
    position ??= this.length;
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + length);
    this.buffer.writeUIntBE(value, position, length);
    this.length = Math.max(this.length, position + length);
  }

  public writeIntBE(value: number, length: number, position?: number): void {
    position ??= this.length;
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + length);
    this.buffer.writeIntBE(value, position, length);
    this.length = Math.max(this.length, position + length);
  }

  public writeUIntLE(value: number, length: number, position?: number): void {
    position ??= this.length;
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + length);
    this.buffer.writeUIntLE(value, position, length);
    this.length = Math.max(this.length, position + length);
  }

  public writeIntLE(value: number, length: number, position?: number): void {
    position ??= this.length;
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + length);
    this.buffer.writeIntLE(value, position, length);
    this.length = Math.max(this.length, position + length);
  }

  public writeU8(value: number, position?: number): void {
    this.writeUIntBE(value, 1, position);
  }

  public writeU16BE(value: number, position?: number): void {
    this.writeUIntBE(value, 2, position);
  }

  public writeU24BE(value: number, position?: number): void {
    this.writeUIntBE(value, 3, position);
  }

  public writeU32BE(value: number, position?: number): void {
    this.writeUIntBE(value, 4, position);
  }

  public writeU16LE(value: number, position?: number): void {
    this.writeUIntLE(value, 2, position);
  }

  public writeU24LE(value: number, position?: number): void {
    this.writeUIntLE(value, 3, position);
  }

  public writeU32LE(value: number, position?: number): void {
    this.writeUIntLE(value, 4, position);
  }

  public writeI8(value: number, position?: number): void {
    this.writeIntBE(value, 1, position);
  }

  public writeI16BE(value: number, position?: number): void {
    this.writeIntBE(value, 2, position);
  }

  public writeI24BE(value: number, position?: number): void {
    this.writeIntBE(value, 3, position);
  }

  public writeI32BE(value: number, position?: number): void {
    this.writeIntBE(value, 4, position);
  }

  public writeI16LE(value: number, position?: number): void {
    this.writeIntLE(value, 2, position);
  }

  public writeI24LE(value: number, position?: number): void {
    this.writeIntLE(value, 3, position);
  }

  public writeI32LE(value: number, position?: number): void {
    this.writeIntLE(value, 4, position);
  }

  public writeF32BE(float: number, position?: number): void {
    position ??= this.length;
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + 4);
    this.buffer.writeFloatBE(float, position);
    this.length = Math.max(this.length, position + 4);
  }

  public writeF64BE(double: number, position?: number): void {
    position ??= this.length;
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + 8);
    this.buffer.writeDoubleBE(double, position);
    this.length = Math.max(this.length, position + 8);
  }

  public writeF32LE(float: number, position?: number): void {
    position ??= this.length;
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + 4);
    this.buffer.writeFloatLE(float, position);
    this.length = Math.max(this.length, position + 4);
  }

  public writeF64LE(double: number, position?: number): void {
    position ??= this.length;
    position = position < 0 ? this.length + position : position;
    if (position < 0) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    this.extend(position + 8);
    this.buffer.writeDoubleLE(double, position);
    this.length = Math.max(this.length, position + 8);
  }

  public read(begin?: number, end?: number): Buffer {
    begin ??= 0;
    end ??= this.length;
    begin = begin < 0 ? this.length + begin : begin;
    end = end < 0 ? this.length + end : end;
    if (begin < 0 || begin > end || end > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return Buffer.from(this.buffer.subarray(begin, end));
  }

  public readUIntBE(position: number, length: number): number {
    position = position < 0 ? this.length + position : position;
    if (position < 0 || position + length > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return this.buffer.readUIntBE(position, length);
  }

  public readIntBE(position: number, length: number): number {
    position = position < 0 ? this.length + position : position;
    if (position < 0 || position + length > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return this.buffer.readIntBE(position, length);
  }

  public readUIntLE(position: number, length: number): number {
    position = position < 0 ? this.length + position : position;
    if (position < 0 || position + length > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return this.buffer.readUIntLE(position, length);
  }

  public readIntLE(position: number, length: number): number {
    position = position < 0 ? this.length + position : position;
    if (position < 0 || position + length > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return this.buffer.readIntLE(position, length);
  }

  public readU8(position: number): number {
    return this.readUIntBE(position, 1);
  }

  public readU16BE(position: number): number {
    return this.readUIntBE(position, 2);
  }

  public readU24BE(position: number): number {
    return this.readUIntBE(position, 3);
  }

  public readU32BE(position: number): number {
    return this.readUIntBE(position, 4);
  }

  public readU16LE(position: number): number {
    return this.readUIntLE(position, 2);
  }

  public readU24LE(position: number): number {
    return this.readUIntLE(position, 3);
  }

  public readU32LE(position: number): number {
    return this.readUIntLE(position, 4);
  }

  public readI8(position: number): number {
    return this.readIntBE(position, 1);
  }

  public readI16BE(position: number): number {
    return this.readIntBE(position, 2);
  }

  public readI24BE(position: number): number {
    return this.readIntBE(position, 3);
  }

  public readI32BE(position: number): number {
    return this.readIntBE(position, 4);
  }

  public readI16LE(position: number): number {
    return this.readIntLE(position, 2);
  }

  public readI24LE(position: number): number {
    return this.readIntLE(position, 3);
  }

  public readI32LE(position: number): number {
    return this.readIntLE(position, 4);
  }

  public readF32BE(position: number): number {
    position = position < 0 ? this.length + position : position;
    if (position < 0 || position + 4 > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return this.buffer.readFloatBE(position);
  }

  public readF64BE(position: number): number {
    position = position < 0 ? this.length + position : position;
    if (position < 0 || position + 8 > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return this.buffer.readDoubleBE(position);
  }

  public readF32LE(position: number): number {
    position = position < 0 ? this.length + position : position;
    if (position < 0 || position + 4 > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return this.buffer.readFloatLE(position);
  }

  public readF64LE(position: number): number {
    position = position < 0 ? this.length + position : position;
    if (position < 0 || position + 8 > this.length) {
      throw new RangeError('Attempt to access memory outside buffer bounds');
    }
    return this.buffer.readDoubleLE(position);
  }

  public byteLength(): number {
    return this.length;
  }
}
