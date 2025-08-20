import { describe, expect, test } from 'vitest';
import ByteReader from '../src/byte-reader.mts';

describe('Unit Test', () => {
  test('Read all buffer (empty)', () => {
    const buffer = Buffer.from([]);
    const target = new ByteReader(buffer);

    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Read all buffer (not-empty)', () => {
    const buffer = Buffer.from(Array.from({ length: 1000 }, (_, i) => i));
    const target = new ByteReader(buffer);

    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Read unsigned int 8-bit', () => {
    const length = 1;
    const value = 0x01;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readU8()).toStrictEqual(value);
  });

  test('Read unsigned int 16-bit Big Endian', () => {
    const length = 2;
    const value = 0x0102;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readU16BE()).toStrictEqual(value);
  });

  test('Read unsigned int 24-bit Big Endian', () => {
    const length = 3;
    const value = 0x010203;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readU24BE()).toStrictEqual(value);
  });

  test('Read unsigned int 32-bit Big Endian', () => {
    const length = 4;
    const value = 0x01020304;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readU32BE()).toStrictEqual(value);
  });

  test('Read signed int 8-bit', () => {
    const length = 1;
    const value = 0x01;
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readI8()).toStrictEqual(value);
  });

  test('Read signed int 16-bit Big Endian', () => {
    const length = 2;
    const value = 0x0102;
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readI16BE()).toStrictEqual(value);
  });

  test('Read signed int 24-bit Big Endian', () => {
    const length = 3;
    const value = 0x010203;
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readI24BE()).toStrictEqual(value);
  });

  test('Read signed int 32-bit Big Endian', () => {
    const length = 4;
    const value = 0x01020304;
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readI32BE()).toStrictEqual(value);
  });

  test('Read float 32-bit Big Endian', () => {
    const length = 4;
    const value = 0.5;
    const buffer = Buffer.from({ length });
    buffer.writeFloatBE(value, 0);
    const target = new ByteReader(buffer);

    expect(target.readF32BE()).toStrictEqual(value);
  });

  test('Read double 64-bit Big Endian', () => {
    const length = 8;
    const value = 0.25;
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    const target = new ByteReader(buffer);

    expect(target.readF64BE()).toStrictEqual(value);
  });

  test('Read double 64-bit Big Endian (NaN)', () => {
    const length = 8;
    const value = Number.NaN;
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    const target = new ByteReader(buffer);

    expect(target.readF64BE()).toStrictEqual(value);
  });

  test('Read double 64-bit Big Endian (POSITIVE_INFINITY)', () => {
    const length = 8;
    const value = Number.POSITIVE_INFINITY;
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    const target = new ByteReader(buffer);

    expect(target.readF64BE()).toStrictEqual(value);
  });

  test('Read double 64-bit Big Endian (NEGATIVE_INFINITY)', () => {
    const length = 8;
    const value = Number.NEGATIVE_INFINITY;
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    const target = new ByteReader(buffer);

    expect(target.readF64BE()).toStrictEqual(value);
  });

  test('Read double 64-bit Big Endian (MAX_VALUE)', () => {
    const length = 8;
    const value = Number.MAX_VALUE;
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    const target = new ByteReader(buffer);

    expect(target.readF64BE()).toStrictEqual(value);
  });

  test('Read double 64-bit Big Endian (MIN_VALUE)', () => {
    const length = 8;
    const value = Number.MIN_VALUE;
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    const target = new ByteReader(buffer);

    expect(target.readF64BE()).toStrictEqual(value);
  });

  test('Read beyond buffer boundary throw Error', () => {
    const target = new ByteReader(Buffer.from([]));
    expect(() => target.read(1)).toThrow();
    expect(() => target.readU8()).toThrow();
    expect(() => target.readU16BE()).toThrow();
    expect(() => target.readU24BE()).toThrow();
    expect(() => target.readU32BE()).toThrow();
    expect(() => target.readI8()).toThrow();
    expect(() => target.readI16BE()).toThrow();
    expect(() => target.readI24BE()).toThrow();
    expect(() => target.readI32BE()).toThrow();
    expect(() => target.readF32BE()).toThrow();
    expect(() => target.readF64BE()).toThrow();
  });

  test.each([
    ['Read single unsigned 1-byte value',  { length: 1 }],
    ['Read single unsigned 2-bytes value', { length: 2 }],
    ['Read single unsigned 3-bytes value', { length: 3 }],
    ['Read single unsigned 4-bytes value', { length: 4 }],
  ])('%s', (_, { length }) => {
    const value = length;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readUIntBE(length)).toStrictEqual(value);
  });

  test.each([
    ['Read single signed 1-byte plus value',   { length: 1, sign: 1 }],
    ['Read single signed 2-bytes plus value',  { length: 2, sign: 1 }],
    ['Read single signed 3-bytes plus value',  { length: 3, sign: 1 }],
    ['Read single signed 4-bytes plus value',  { length: 4, sign: 1 }],
    ['Read single signed 1-byte minus value',  { length: 1, sign: -1 }],
    ['Read single signed 2-bytes minus value', { length: 2, sign: -1 }],
    ['Read single signed 3-bytes minus value', { length: 3, sign: -1 }],
    ['Read single signed 4-bytes minus value', { length: 4, sign: -1 }],
  ])('%s', (_, { length, sign }) => {
    const value = length * sign;
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    const target = new ByteReader(buffer);

    expect(target.readIntBE(length)).toStrictEqual(value);
  });

  test.each([
    ['Read single empty buffer',      { length: 0 }],
    ['Read single 1-byte buffer',     { length: 1 }],
    ['Read single 2-bytes buffer',    { length: 2 }],
    ['Read single 3-bytes buffer',    { length: 3 }],
    ['Read single 4-bytes buffer',    { length: 4 }],
    ['Read single 8-bytes buffer',    { length: 8 }],
    ['Read single 16-bytes buffer',   { length: 16 }],
    ['Read single 128-bytes buffer',  { length: 128 }],
    ['Read single 1024-bytes buffer', { length: 1024 }],
  ])('%s', (_, { length }) => {
    const buffer = Buffer.from(Array.from({ length }, (_, i) => i % 256));
    const target = new ByteReader(buffer);

    expect((target.read(buffer.byteLength)).equals(buffer)).toStrictEqual(true);
  });

  test.each([
    ['Read twice empty buffer',      { length: 0 }],
    ['Read twice 1-byte buffer',     { length: 1 }],
    ['Read twice 2-bytes buffer',    { length: 2 }],
    ['Read twice 3-bytes buffer',    { length: 3 }],
    ['Read twice 4-bytes buffer',    { length: 4 }],
    ['Read twice 8-bytes buffer',    { length: 8 }],
    ['Read twice 16-bytes buffer',   { length: 16 }],
    ['Read twice 128-bytes buffer',  { length: 128 }],
    ['Read twice 1024-bytes buffer', { length: 1024 }],
  ])('%s', (_, { length }) => {
    const buffer = Buffer.from(Array.from({ length }, (_, i) => i % 256));
    const target = new ByteReader(Buffer.concat([buffer, buffer]));

    expect((target.read(buffer.byteLength)).equals(buffer)).toStrictEqual(true);
    expect((target.read(buffer.byteLength)).equals(buffer)).toStrictEqual(true);
  });
});
