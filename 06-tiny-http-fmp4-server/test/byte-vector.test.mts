import { describe, expect, test } from 'vitest';
import ByteVector from '../src/byte-vector.mts';

describe('Unit Test', () => {
  test('Build empty buffer in initial state', () => {
    const target = new ByteVector();
    expect(target.byteLength()).toStrictEqual(0);
    expect(target.read().equals(Buffer.from([]))).toStrictEqual(true);
  });

  test('Build non-empty buffer in initial state', () => {
    const buffer = Buffer.from([0x01, 0x02, 0x03]);
    const target = ByteVector.from(buffer);
    expect(target.byteLength()).toStrictEqual(buffer.byteLength);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Build twice also empty buffer in initial state', () => {
    const target = new ByteVector();
    expect(target.byteLength()).toStrictEqual(0);
    expect(target.read().equals(Buffer.from([]))).toStrictEqual(true);
    expect(target.read().equals(Buffer.from([]))).toStrictEqual(true);
  });

  test('Write unsigned int 8-bit', () => {
    const length = 1;
    const value = 0x01;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    target.writeU8(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write unsigned int 16-bit Big Endian', () => {
    const length = 2;
    const value = 0x0102;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    target.writeU16BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write unsigned int 24-bit Big Endian', () => {
    const length = 3;
    const value = 0x010203;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    target.writeU24BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write unsigned int 32-bit Big Endian', () => {
    const length = 4;
    const value = 0x01020304;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    target.writeU32BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write unsigned int 16-bit Little Endian', () => {
    const length = 2;
    const value = 0x0102;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeUintLE(value, 0, length);
    target.writeU16LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write unsigned int 24-bit Little Endian', () => {
    const length = 3;
    const value = 0x010203;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeUintLE(value, 0, length);
    target.writeU24LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write unsigned int 32-bit Little Endian', () => {
    const length = 4;
    const value = 0x01020304;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeUintLE(value, 0, length);
    target.writeU32LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write signed int 8-bit', () => {
    const length = 1;
    const value = 0x01;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    target.writeI8(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write signed int 16-bit Big Endian', () => {
    const length = 2;
    const value = 0x0102;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    target.writeI16BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write signed int 24-bit Big Endian', () => {
    const length = 3;
    const value = 0x010203;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    target.writeI24BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write signed int 32-bit Big Endian', () => {
    const length = 4;
    const value = 0x01020304;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(value, 0, length);
    target.writeI32BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write signed int 16-bit Little Endian', () => {
    const length = 2;
    const value = 0x0102;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeIntLE(value, 0, length);
    target.writeI16LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write signed int 24-bit Little Endian', () => {
    const length = 3;
    const value = 0x010203;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeIntLE(value, 0, length);
    target.writeI24LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write signed int 32-bit Little Endian', () => {
    const length = 4;
    const value = 0x01020304;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeIntLE(value, 0, length);
    target.writeI32LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write float 32-bit Big Endian', () => {
    const length = 4;
    const value = 0.3;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeFloatBE(value, 0);
    target.writeF32BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Big Endian', () => {
    const length = 8;
    const value = 0.6;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    target.writeF64BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Big Endian (NaN)', () => {
    const length = 8;
    const value = Number.NaN;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    target.writeF64BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Big Endian (POSITIVE_INFINITY)', () => {
    const length = 8;
    const value = Number.POSITIVE_INFINITY;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    target.writeF64BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Big Endian (NEGATIVE_INFINITY)', () => {
    const length = 8;
    const value = Number.NEGATIVE_INFINITY;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    target.writeF64BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Big Endian (MAX_VALUE)', () => {
    const length = 8;
    const value = Number.MAX_VALUE;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    target.writeF64BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Big Endian (MIN_VALUE)', () => {
    const length = 8;
    const value = Number.MIN_VALUE;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleBE(value, 0);
    target.writeF64BE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write float 32-bit Little Endian', () => {
    const length = 4;
    const value = 0.3;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeFloatLE(value, 0);
    target.writeF32LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Little Endian', () => {
    const length = 8;
    const value = 0.6;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleLE(value, 0);
    target.writeF64LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Little Endian (NaN)', () => {
    const length = 8;
    const value = Number.NaN;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleLE(value, 0);
    target.writeF64LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Little Endian (POSITIVE_INFINITY)', () => {
    const length = 8;
    const value = Number.POSITIVE_INFINITY;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleLE(value, 0);
    target.writeF64LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Little Endian (NEGATIVE_INFINITY)', () => {
    const length = 8;
    const value = Number.NEGATIVE_INFINITY;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleLE(value, 0);
    target.writeF64LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Little Endian (MAX_VALUE)', () => {
    const length = 8;
    const value = Number.MAX_VALUE;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleLE(value, 0);
    target.writeF64LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write double 64-bit Little Endian (MIN_VALUE)', () => {
    const length = 8;
    const value = Number.MIN_VALUE;
    const target = new ByteVector();
    const buffer = Buffer.from({ length });
    buffer.writeDoubleLE(value, 0);
    target.writeF64LE(value);

    expect(target.byteLength()).toStrictEqual(length);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test.each([
    ['Write single unsigned 1-byte value',  { length: 1 }],
    ['Write single unsigned 2-bytes Big Endian value', { length: 2 }],
    ['Write single unsigned 3-bytes Big Endian value', { length: 3 }],
    ['Write single unsigned 4-bytes Big Endian value', { length: 4 }],
  ])('%s', (_, { length }) => {
    const buffer = Buffer.from({ length });
    buffer.writeUIntBE(length, 0, length);
    const target = new ByteVector();
    target.writeUIntBE(length, length);

    expect(target.byteLength()).toStrictEqual(buffer.byteLength);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test.each([
    ['Write single unsigned 2-bytes Little Endian value', { length: 2 }],
    ['Write single unsigned 3-bytes Little value', { length: 3 }],
    ['Write single unsigned 4-bytes Little value', { length: 4 }],
  ])('%s', (_, { length }) => {
    const buffer = Buffer.from({ length });
    buffer.writeUIntLE(length, 0, length);
    const target = new ByteVector();
    target.writeUIntLE(length, length);

    expect(target.byteLength()).toStrictEqual(buffer.byteLength);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test.each([
    ['Write single signed 1-byte plus value',   { length: 1, sign: 1 }],
    ['Write single signed 2-bytes Big Endian plus value',  { length: 2, sign: 1 }],
    ['Write single signed 3-bytes Big Endian plus value',  { length: 3, sign: 1 }],
    ['Write single signed 4-bytes Big Endian plus value',  { length: 4, sign: 1 }],
    ['Write single signed 1-byte minus value',  { length: 1, sign: -1 }],
    ['Write single signed 2-bytes Big Endian minus value', { length: 2, sign: -1 }],
    ['Write single signed 3-bytes Big Endian minus value', { length: 3, sign: -1 }],
    ['Write single signed 4-bytes Big Endian minus value', { length: 4, sign: -1 }],
  ])('%s', (_, { length, sign }) => {
    const buffer = Buffer.from({ length });
    buffer.writeIntBE(length * sign, 0, length);
    const target = new ByteVector();
    target.writeIntBE(length * sign, length);

    expect(target.byteLength()).toStrictEqual(buffer.byteLength);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test.each([
    ['Write single signed 2-bytes Little Endian plus value',  { length: 2, sign: 1 }],
    ['Write single signed 3-bytes Little Endian plus value',  { length: 3, sign: 1 }],
    ['Write single signed 4-bytes Little Endian plus value',  { length: 4, sign: 1 }],
    ['Write single signed 2-bytes Little Endian minus value', { length: 2, sign: -1 }],
    ['Write single signed 3-bytes Little Endian minus value', { length: 3, sign: -1 }],
    ['Write single signed 4-bytes Little Endian minus value', { length: 4, sign: -1 }],
  ])('%s', (_, { length, sign }) => {
    const buffer = Buffer.from({ length });
    buffer.writeIntLE(length * sign, 0, length);
    const target = new ByteVector();
    target.writeIntLE(length * sign, length);

    expect(target.byteLength()).toStrictEqual(buffer.byteLength);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test.each([
    ['Write single empty buffer',      { length: 0 }],
    ['Write single 1-byte buffer',     { length: 1 }],
    ['Write single 2-bytes buffer',    { length: 2 }],
    ['Write single 3-bytes buffer',    { length: 3 }],
    ['Write single 4-bytes buffer',    { length: 4 }],
    ['Write single 8-bytes buffer',    { length: 8 }],
    ['Write single 16-bytes buffer',   { length: 16 }],
    ['Write single 128-bytes buffer',  { length: 128 }],
    ['Write single 1024-bytes buffer', { length: 1024 }],
  ])('%s', (_, { length }) => {
    const target = new ByteVector();
    const buffer = Buffer.from(Array.from({ length }, (_, i) => i % 256));
    target.write(buffer);

    expect(target.byteLength()).toStrictEqual(buffer.byteLength);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test.each([
    ['Write twice empty buffer',      { length: 0 }],
    ['Write twice 1-byte buffer',     { length: 1 }],
    ['Write twice 2-bytes buffer',    { length: 2 }],
    ['Write twice 3-bytes buffer',    { length: 3 }],
    ['Write twice 4-bytes buffer',    { length: 4 }],
    ['Write twice 8-bytes buffer',    { length: 8 }],
    ['Write twice 16-bytes buffer',   { length: 16 }],
    ['Write twice 128-bytes buffer',  { length: 128 }],
    ['Write twice 1024-bytes buffer', { length: 1024 }],
  ])('%s', (_, { length }) => {
    const target = new ByteVector();
    const buffer = Buffer.from(Array.from({ length }, (_, i) => i % 256));
    const concat = Buffer.concat([buffer, buffer]);
    target.write(concat);

    expect(target.byteLength()).toStrictEqual(concat.byteLength);
    expect(target.read().equals(concat)).toStrictEqual(true);
  });

  test('Write mixed data types', () => {
    const target = new ByteVector();
    target.writeU8(0x01);
    target.writeU16BE(0x0203);
    target.writeI32BE(-1);
    target.writeF32BE(3.14);

    const buffer = Buffer.from({ length: 11 });
    buffer.writeUInt8(0x01, 0);
    buffer.writeUInt16BE(0x0203, 1);
    buffer.writeInt32BE(-1, 3);
    buffer.writeFloatBE(3.14, 7);

    expect(target.byteLength()).toStrictEqual(buffer.byteLength);
    expect(target.read().equals(buffer)).toStrictEqual(true);
  });

  test('Write mixed data with multiple build', () => {
    const target = new ByteVector();

    {
      const buffer1 = Buffer.from({ length: 3 });
      target.writeU8(0x01);
      target.writeU16BE(0x0203);
      buffer1.writeUInt8(0x01, 0);
      buffer1.writeUInt16BE(0x0203, 1);
      expect(target.byteLength()).toStrictEqual(buffer1.byteLength);
      expect(target.read().equals(buffer1)).toStrictEqual(true);
    }
    {
      const buffer2 = Buffer.from({ length: 11 });
      target.writeI32BE(-1);
      target.writeF32BE(3.14);
      buffer2.writeUInt8(0x01, 0);
      buffer2.writeUInt16BE(0x0203, 1);
      buffer2.writeInt32BE(-1, 3);
      buffer2.writeFloatBE(3.14, 7);
      expect(target.byteLength()).toStrictEqual(buffer2.byteLength);
      expect(target.read().equals(buffer2)).toStrictEqual(true);
    }
  });
});
