import ByteReader from './byte-reader.mts';

const scriptend: unique symbol = Symbol();
type AMF0Object = {
  [key: string]: AMF0Value;
}
type AMF0Value = number | boolean | string | null | undefined | typeof scriptend | Date | AMF0Object | AMF0Value[];

const string = (reader: ByteReader): string => {
  const length = reader.readU16BE();
  return reader.read(length).toString('utf-8');
};

const longstring = (reader: ByteReader): string => {
  const length = reader.readU32BE();
  return reader.read(length).toString('utf-8');
};

const object = (reader: ByteReader): AMF0Object => {
  const object: AMF0Object = {};
  while (true) {
    const name = string(reader);
    const val = value(reader);
    if (val === scriptend) { return object; }
    object[name] = val;
  }
};

const mixedarray = (reader: ByteReader): AMF0Object  => {
  reader.readU32BE(); // length
  return object(reader);
};

const strictarray = (reader: ByteReader): AMF0Value[] => {
  const length = reader.readU32BE();
  const array = [];
  for (let i = 0; i < length; i++) {
    array.push(value(reader));
  }
  return array;
};

const date = (reader: ByteReader): Date => {
  const timestamp = reader.readF64BE();
  const localtimeoffset = reader.readI16BE();
  return new Date(timestamp);
};

const value = (reader: ByteReader): AMF0Value => {
  const tag = reader.readU8();
  switch (tag) {
    case 0: return reader.readF64BE();
    case 1: return reader.readU8() !== 0;
    case 2: return string(reader);
    case 3: return object(reader);
    case 4: throw new Error('Unsupported Tag: 4 (movie clip)');
    case 5: return null;
    case 6: return undefined;
    case 7: throw new Error('Unsupported Tag: 7 (reference)');
    case 8: return mixedarray(reader);
    case 9: return scriptend;
    case 10: return strictarray(reader);
    case 11: return date(reader);
    case 12: return longstring(reader);
  }
  throw new Error(`Invalid tag: ${tag}`);
};

export default (data: Buffer): any[] => {
  const reader = new ByteReader(data);
  const result: any[] = [];
  while (!reader.isEOF()) {
    result.push(value(reader));
  }
  return result;
};
