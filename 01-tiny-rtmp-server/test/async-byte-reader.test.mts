import { describe, expect, test } from 'vitest';
import AsyncByteReader from '../src/async-byte-reader.mts';

describe('Unit Test', () => {
  test('Read empty bytes in initial state should resolved', async () => {
    const reader = new AsyncByteReader();

    await expect(reader.read(0)).resolves.toStrictEqual(Buffer.from([]));
  });

  test('Read non-empty bytes in initial state should not resolved', async () => {
    const reader = new AsyncByteReader();

    let resolved = false;
    reader.read(1).then(() => { resolved = true; });
    // wait MacroTask
    await new Promise(resolve => { setImmediate(resolve); });

    expect(resolved).toStrictEqual(false);
  });

  test('Read non-empty bytes in initial state and reach EOF should reject', async () => {
    const reader = new AsyncByteReader();
    const promise = reader.read(1);
    reader.feedEOF();

    await expect(promise).rejects.toThrow();
  });

  test('Read non-empty bytes in EOF should reject', async () => {
    const reader = new AsyncByteReader();
    reader.feedEOF();
    const promise = reader.read(1);

    await expect(promise).rejects.toThrow();
  });

  test('Read non-empty bytes in Abort also should reject', async () => {
    const controller = new AbortController();
    const reader = new AsyncByteReader({ signal: controller.signal });
    controller.abort();
    const promise = reader.read(1);

    await expect(promise).rejects.toThrow();
  });

  test('Read unsigned int 8-bit', async () => {
    const length = 1;
    const value = 0x01;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const reader = new AsyncByteReader();
    reader.feed(buffer);
    await expect(reader.readU8()).resolves.toStrictEqual(value);
  });

  test('Read unsigned int 16-bit Big Endian', async () => {
    const length = 2;
    const value = 0x0102;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const reader = new AsyncByteReader();
    reader.feed(buffer);
    await expect(reader.readU16BE()).resolves.toStrictEqual(value);
  });

  test('Read unsigned int 24-bit Big Endian', async () => {
    const length = 3;
    const value = 0x010203;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const reader = new AsyncByteReader();
    reader.feed(buffer);
    await expect(reader.readU24BE()).resolves.toStrictEqual(value);
  });

  test('Read unsigned int 32-bit Big Endian', async () => {
    const length = 4;
    const value = 0x01020304;
    const buffer = Buffer.from({ length });
    buffer.writeUintBE(value, 0, length);
    const reader = new AsyncByteReader();
    reader.feed(buffer);
    await expect(reader.readU32BE()).resolves.toStrictEqual(value);
  });

  test('Read unsigned int 16-bit Little Endian', async () => {
    const length = 2;
    const value = 0x0102;
    const buffer = Buffer.from({ length });
    buffer.writeUintLE(value, 0, length);
    const reader = new AsyncByteReader();
    reader.feed(buffer);
    await expect(reader.readU16LE()).resolves.toStrictEqual(value);
  });

  test('Read unsigned int 24-bit Little Endian', async () => {
    const length = 3;
    const value = 0x010203;
    const buffer = Buffer.from({ length });
    buffer.writeUintLE(value, 0, length);
    const reader = new AsyncByteReader();
    reader.feed(buffer);
    await expect(reader.readU24LE()).resolves.toStrictEqual(value);
  });

  test('Read unsigned int 32-bit Little Endian', async () => {
    const length = 4;
    const value = 0x01020304;
    const buffer = Buffer.from({ length });
    buffer.writeUintLE(value, 0, length);
    const reader = new AsyncByteReader();
    reader.feed(buffer);
    await expect(reader.readU32LE()).resolves.toStrictEqual(value);
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
  ])('%s', async (_, { length }) => {
    const buffer = Buffer.from(Array.from({ length }, (_, i) => i % 256));
    const reader = new AsyncByteReader();
    reader.feed(buffer);

    expect((await reader.read(buffer.byteLength)).equals(buffer)).toStrictEqual(true);
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
  ])('%s', async (_, { length }) => {
    const buffer = Buffer.from(Array.from({ length }, (_, i) => i % 256));
    const reader = new AsyncByteReader();
    reader.feed(Buffer.concat([buffer, buffer]));

    expect((await reader.read(buffer.byteLength)).equals(buffer)).toStrictEqual(true);
    expect((await reader.read(buffer.byteLength)).equals(buffer)).toStrictEqual(true);
  });

  test.each([
    ['Read twice 1-byte buffer and reach EOF',     { length: 1 }],
    ['Read twice 2-bytes buffer and reach EOF',    { length: 2 }],
    ['Read twice 3-bytes buffer and reach EOF',    { length: 3 }],
    ['Read twice 4-bytes buffer and reach EOF',    { length: 4 }],
    ['Read twice 8-bytes buffer and reach EOF',    { length: 8 }],
    ['Read twice 16-bytes buffer and reach EOF',   { length: 16 }],
    ['Read twice 128-bytes buffer and reach EOF',  { length: 128 }],
    ['Read twice 1024-bytes buffer and reach EOF', { length: 1024 }],
  ])('%s', async (_, { length }) => {
    const buffer = Buffer.from(Array.from({ length }, (_, i) => i % 256));
    const reader = new AsyncByteReader();
    reader.feed(buffer);
    reader.feedEOF();
    reader.feed(buffer);

    expect((await reader.read(buffer.byteLength)).equals(buffer)).toStrictEqual(true);
    await expect(reader.read(buffer.byteLength)).rejects.toThrow();
  });

  test.each([
    ['Read twice 1-byte buffer in reach EOF',     { length: 1 }],
    ['Read twice 2-bytes buffer in reach EOF',    { length: 2 }],
    ['Read twice 3-bytes buffer in reach EOF',    { length: 3 }],
    ['Read twice 4-bytes buffer in reach EOF',    { length: 4 }],
    ['Read twice 8-bytes buffer in reach EOF',    { length: 8 }],
    ['Read twice 16-bytes buffer in reach EOF',   { length: 16 }],
    ['Read twice 128-bytes buffer in reach EOF',  { length: 128 }],
    ['Read twice 1024-bytes buffer in reach EOF', { length: 1024 }],
  ])('%s', async (_, { length }) => {
    const buffer = Buffer.from(Array.from({ length }, (_, i) => i % 256));
    const reader = new AsyncByteReader();
    reader.feedEOF();
    reader.feed(buffer);
    reader.feed(buffer);

    await expect(reader.read(buffer.byteLength)).rejects.toThrow();
    await expect(reader.read(buffer.byteLength)).rejects.toThrow();
  });
});
