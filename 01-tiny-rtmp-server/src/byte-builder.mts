export default class ByteBuilder {
  private buffers: Buffer[] = [];
  private length = 0;

  public write(buffer: Buffer): void {
    this.length += buffer.byteLength;
    this.buffers.push(buffer);
  }

  public writeUIntBE(value: number, length: number): void {
    const buffer = Buffer.alloc(length);
    buffer.writeUIntBE(value, 0, length);
    this.write(buffer);
  }

  public writeIntBE(value: number, length: number): void {
    const buffer = Buffer.alloc(length);
    buffer.writeIntBE(value, 0, length);
    this.write(buffer);
  }

  public writeUIntLE(value: number, length: number): void {
    const buffer = Buffer.alloc(length);
    buffer.writeUIntLE(value, 0, length);
    this.write(buffer);
  }

  public writeIntLE(value: number, length: number): void {
    const buffer = Buffer.alloc(length);
    buffer.writeIntLE(value, 0, length);
    this.write(buffer);
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
    const buffer = Buffer.alloc(4);
    buffer.writeFloatBE(float, 0);
    this.write(buffer);
  }

  public writeF64BE(double: number): void {
    const buffer = Buffer.alloc(8);
    buffer.writeDoubleBE(double, 0);
    this.write(buffer);
  }

  public byteLength(): number {
    return this.length;
  }

  public build(): Buffer {
    return Buffer.concat(this.buffers);
  }
}
