type Query = {
  operation: 'UIntBE',
  value: number;
  byteLength: number,
} | {
  operation: 'UIntLE',
  value: number;
  byteLength: number,
} | {
  operation: 'IntBE',
  value: number
  byteLength: number,
} | {
  operation: 'IntLE',
  value: number
  byteLength: number,
} | {
  operation: 'F32BE';
  value: number
  byteLength: 4,
} | {
  operation: 'F32LE';
  value: number
  byteLength: 4,
} | {
  operation: 'F64BE';
  value: number
  byteLength: 8,
} | {
  operation: 'F64LE';
  value: number
  byteLength: 8,
} | {
  operation: 'Buffer';
  value: Buffer;
  byteLength: number;
};

export default class ByteBuilder {
  private queries: Query[] = [];
  private length = 0;

  public write(buffer: Buffer): void {
    this.length += buffer.byteLength;
    this.queries.push({
      operation: 'Buffer',
      value: buffer,
      byteLength: buffer.byteLength,
    });
  }

  public writeUIntBE(value: number, length: number): void {
    this.length += length;
    this.queries.push({
      operation: 'UIntBE',
      value,
      byteLength: length,
    });
  }

  public writeIntBE(value: number, length: number): void {
    this.length += length;
    this.queries.push({
      operation: 'IntBE',
      value,
      byteLength: length,
    });
  }

  public writeUIntLE(value: number, length: number): void {
    this.length += length;
    this.queries.push({
      operation: 'UIntLE',
      value,
      byteLength: length,
    });
  }

  public writeIntLE(value: number, length: number): void {
    this.length += length;
    this.queries.push({
      operation: 'IntLE',
      value,
      byteLength: length,
    });
  }

  public writeU8(value: number) {
    this.writeUIntBE(value, 1);
  }

  public writeU16BE(value: number) {
    this.writeUIntBE(value, 2);
  }

  public writeU24BE(value: number) {
    this.writeUIntBE(value, 3);
  }

  public writeU32BE(value: number) {
    this.writeUIntBE(value, 4);
  }

  public writeU16LE(value: number) {
    this.writeUIntLE(value, 2);
  }

  public writeU24LE(value: number) {
    this.writeUIntLE(value, 3);
  }

  public writeU32LE(value: number) {
    this.writeUIntLE(value, 4);
  }

  public writeI8(value: number) {
    this.writeIntBE(value, 1);
  }

  public writeI16BE(value: number) {
    this.writeIntBE(value, 2);
  }

  public writeI24BE(value: number) {
    this.writeIntBE(value, 3);
  }

  public writeI32BE(value: number) {
    this.writeIntBE(value, 4);
  }

  public writeI16LE(value: number) {
    this.writeIntLE(value, 2);
  }

  public writeI24LE(value: number) {
    this.writeIntLE(value, 3);
  }

  public writeI32LE(value: number) {
    this.writeIntLE(value, 4);
  }

  public writeF32BE(float: number): void {
    this.length += 4;
    this.queries.push({
      operation: 'F32BE',
      value: float,
      byteLength: 4,
    });
  }

  public writeF64BE(double: number): void {
    this.length += 8;
    this.queries.push({
      operation: 'F64BE',
      value: double,
      byteLength: 8,
    });
  }

  public writeF32LE(float: number): void {
    this.length += 4;
    this.queries.push({
      operation: 'F32LE',
      value: float,
      byteLength: 4,
    });
  }

  public writeF64LE(double: number): void {
    this.length += 8;
    this.queries.push({
      operation: 'F64LE',
      value: double,
      byteLength: 8,
    });
  }

  public byteLength(): number {
    return this.length;
  }

  public build(): Buffer {
    const buffer = Buffer.alloc(this.length);

    let offset = 0;
    for (const { operation, value, byteLength, } of this.queries) {
      switch (operation) {
        case 'UIntBE': buffer.writeUIntBE(value, offset, byteLength); break;
        case 'UIntLE': buffer.writeUIntLE(value, offset, byteLength); break;
        case 'IntBE': buffer.writeIntBE(value, offset, byteLength); break;
        case 'IntLE': buffer.writeIntLE(value, offset, byteLength); break;
        case 'F32BE': buffer.writeFloatBE(value, offset); break;
        case 'F32LE': buffer.writeFloatLE(value, offset); break;
        case 'F64BE': buffer.writeDoubleBE(value, offset); break;
        case 'F64LE': buffer.writeDoubleLE(value, offset); break;
        case 'Buffer': buffer.set(value, offset);
      }
      offset += byteLength;
    }

    return buffer;
  }
}
