import ByteBuilder from './byte-builder.mts';

const number = (dst: ByteBuilder, data: number): void => {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(data, 0);
  dst.write(buffer);
};

const boolean = (dst: ByteBuilder, data: boolean): void => {
  dst.write(Buffer.from([data ? 1 : 0]));
};

const string = (dst: ByteBuilder, data: string): void => {
  const bytes = Buffer.from(data, 'utf-8');
  dst.writeU16BE(bytes.byteLength);
  dst.write(bytes);
};

const object = (dst: ByteBuilder, data: Record<string, any>): void => {
  for (const [k, v] of Object.entries(data)) {
    string(dst, k);
    value(dst, v);
  }
  dst.writeU24BE(0x000009); // ObjectEnd
};

const array = (dst: ByteBuilder, data: any[]): void => {
  dst.writeU32BE(data.length);
  for (const datum of data) {
    value(dst, datum);
  }
};

const date = (dst: ByteBuilder, data: Date): void => {
  dst.writeF64BE(data.getTime());
  dst.writeU16BE(0); // Not-Used
};

const value = (dst: ByteBuilder, data: unknown): void => {
  if (data === null) { dst.writeU8(0x05); return; }
  if (data === undefined){ dst.writeU8(0x06); return; }
  if (Array.isArray(data)) { dst.writeU8(0x0a); array(dst, data); return; }
  if (data instanceof Date) { date(dst, data); return; }
  switch (typeof data) {
    case 'number': dst.writeU8(0x00); ; number(dst, data); return;
    case 'boolean': dst.writeU8(0x01); boolean(dst, data); return;
    case 'string': {
      const buffer = Buffer.from(data, 'utf-8');
      if (buffer.byteLength < 2 ** 16) {
        dst.writeU8(0x02);
        dst.writeU16BE(buffer.byteLength);
        dst.write(buffer);
        return;
      } else {
        dst.writeU8(0x0c);
        dst.writeU32BE(buffer.byteLength);
        dst.write(buffer);
        return;
      }
    }
    case 'object': dst.writeU8(0x03); object(dst, data); return;
    default: return;
  }
};

export default (... data: unknown[]): Buffer => {
  const builder = new ByteBuilder();
  for (const datum of data) {
    value(builder, datum);
  }
  return builder.build();
};
