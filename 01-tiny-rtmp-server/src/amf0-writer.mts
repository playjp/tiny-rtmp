function* number(data: number): Iterable<Buffer> {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(data, 0);
  yield buffer;
}

function* boolean(bool: boolean): Iterable<Buffer> {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(bool ? 1 : 0, 0);
  yield buffer;
}

function* string(data: string): Iterable<Buffer> {
  const utf8 = Buffer.from(data, 'utf-8');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(utf8.byteLength);
  yield length;
  yield utf8;
};

function* object(obj: Record<string, any>): Iterable<Buffer> {
  for (const [k, v] of Object.entries(obj)) {
    yield* string(k);
    yield* value(v);
  }
  yield Buffer.from([0x00, 0x00, 0x09]);
};

function* array(data: any[]): Iterable<Buffer> {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  yield length;
  for (const datum of data) { yield* value(datum); }
};

function* date(data: Date): Iterable<Buffer> {
  const buffer = Buffer.alloc(10);
  buffer.writeDoubleBE(data.getTime(), 0);
  buffer.writeInt16BE(0, 8); // reseved
  yield buffer;
};

function* value(data: any): Iterable<Buffer> {
  if (data === null) { yield Buffer.from([0x05]); return; }
  if (data === undefined) { yield Buffer.from([0x06]); return; }
  if (Array.isArray(data)) { yield Buffer.from([0x0a]); yield* array(data); return; }
  if (data instanceof Date) { yield Buffer.from([0x0b]); yield* date(data); return; }
  switch (typeof data) {
    case 'number': yield Buffer.from([0x00]); yield* number(data); return;
    case 'boolean': yield Buffer.from([0x01]); yield* boolean(data); return;
    case 'string': { // Buffer.from([0x02]); yield* string(data); return;
      const buffer = Buffer.from(data, 'utf-8');
      if (buffer.byteLength < 2 ** 16) {
        const length = Buffer.alloc(2);
        length.writeUInt16BE(buffer.byteLength);
        yield Buffer.from([0x02]); yield length; yield buffer; return;
      } else {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(buffer.byteLength);
        yield Buffer.from([0x0c]); yield length; yield buffer; return;
      }
    }
    case 'object': yield Buffer.from([0x03]); yield* object(data); return;
    default: return;
  }
};

export default (... data: any[]): Buffer => {
  const buffers: Buffer[] = [];
  for (const datum of data) {
    for (const buffer of value(datum)) {
      buffers.push(buffer);
    }
  }
  return Buffer.concat(buffers);
};
