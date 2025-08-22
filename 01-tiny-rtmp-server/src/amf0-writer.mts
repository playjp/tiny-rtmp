import { doubleBE, insert, uint16BE, uint32BE, uint8 } from "./byte-utils.mts";

const number = (dst: number[], data: number): void => {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(data, 0);
  insert(dst, buffer);
}

const boolean = (dst: number[], data: boolean): void => {
  insert(dst, [data ? 1 : 0]);
}

const string = (dst: number[], data: string): void => {
  const bytes = Buffer.from(data, 'utf-8');
  insert(dst, uint16BE(bytes.byteLength));
  insert(dst, bytes);
}

const object = (dst: number[], data: Record<string, any>): void => {
  for (const [k, v] of Object.entries(data)) {
    string(dst, k);
    value(dst, v);
  }
  insert(dst, [0x00, 0x00, 0x09]);
}

const array = (dst: number[], data: any[]): void => {
  insert(dst, uint32BE(data.length));
  for (const datum of data) {
    value(dst, datum);
  }
}

const date = (dst: number[], data: Date): void => {
  insert(dst, doubleBE(data.getTime()));
  insert(dst, uint16BE(0));
}

const value = (dst: number[], data: any): void => {
  if (data === null) { insert(dst, uint8(0x05)); return; }
  if (data === undefined){ insert(dst, uint8(0x06)); return; }
  if (Array.isArray(data)) { insert(dst, uint8(0x0a)); array(dst, data); return; }
  if (data instanceof Date) { date(dst, data); return; }
  switch (typeof data) {
    case 'number': insert(dst, uint8(0x00)); number(dst, data); return;
    case 'boolean': insert(dst, uint8(0x01)); boolean(dst, data); return;
    case 'string': {
      const buffer = Buffer.from(data, 'utf-8');
      if (buffer.byteLength < 2 ** 16) {
        insert(dst, uint8(0x02));
        insert(dst, uint16BE(buffer.byteLength));
        insert(dst, buffer);
        return;
      } else {
        insert(dst, uint8(0x0c));
        insert(dst, uint32BE(buffer.byteLength));
        insert(dst, buffer);
        return;
      }
    }
    case 'object': insert(dst, uint8(0x03)); object(dst, data); return;
    default: return;
  }
}

export default (... data: any[]): Buffer => {
  const result: number[] = [];
  for (const datum of data) {
    value(result, datum);
  }
  return Buffer.from(result);
};
