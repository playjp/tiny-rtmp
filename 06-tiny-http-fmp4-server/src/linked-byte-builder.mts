class LinkedNode {
  public prev: LinkedNode | null;
  public next: LinkedNode | null;
  public readonly buffer: Buffer;

  constructor(buffer: Buffer) {
    this.prev = this.next = null;
    this.buffer = buffer;
  }
}

export default class LinkedByteBuilder {
  private begin: LinkedNode;
  private end: LinkedNode;
  private length = 0;

  public constructor() {
    this.begin = new LinkedNode(Buffer.from([]));
    this.end = new LinkedNode(Buffer.from([]));
    this.begin.next = this.end;
    this.end.prev = this.begin;
  }

  public write(buffer: Buffer): void {
    const node = new LinkedNode(buffer);
    this.length += buffer.byteLength;
    const last = this.end.prev!;
    node.prev = last
    last.next = node;
    this.end.prev = node;
    node.next = this.end;
  }

  public append(builder: LinkedByteBuilder): void {
    if (builder.length === 0) { return; }
    this.length += builder.length;
    const own_last = this.end.prev!;
    const append_first = builder.begin.next!;
    const append_last = builder.end.prev!;
    append_first.prev = own_last;
    own_last.next = append_first;
    this.end.prev = append_last;
    append_last.next = this.end;
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

  public writeF32LE(float: number): void {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(float, 0);
    this.write(buffer);
  }

  public writeF64LE(double: number): void {
    const buffer = Buffer.alloc(8);
    buffer.writeDoubleLE(double, 0);
    this.write(buffer);
  }

  public *[Symbol.iterator](): Iterator<Buffer> {
    let node: LinkedNode = this.begin.next!;
    while (node != this.end) {
      yield node.buffer;
      node = node.next!;
    }
  }

  public byteLength(): number {
    return this.length;
  }

  public build(): Buffer {
    return Buffer.concat(Array.from(this));
  }
}
