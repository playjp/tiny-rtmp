import { describe, expect, test } from 'vitest';
import write_amf0 from '../src/amf0-writer.mts';

describe('Unit Test', () => {
  test.each([
    ['Type: 0 (number)', { value: 1935, expected: Buffer.from('00409e3c0000000000', 'hex') }],
    ['Type: 1 (boolean: true)', { value: true, expected: Buffer.from('0101', 'hex') }],
    ['Type: 1 (boolean: false)', { value: false, expected: Buffer.from('0100', 'hex') }],
    ['Type: 2 (string)', { value: 'tiny-rtmp', expected: Buffer.from('02000974696e792d72746d70', 'hex') }],
    ['Type: 3 (object)', { value: {}, expected: Buffer.from('03000009', 'hex') }],
    ['Type: 5 (null)', { value: null, expected: Buffer.from('05', 'hex') }],
    ['Type: 6 (undefined)', { value: undefined, expected: Buffer.from('06', 'hex') }],
    ['type: 10 (strict array)', { value: [], expected: Buffer.from('0a00000000', 'hex') }],
    ['type: 11 (Date)', { value: new Date(0), expected: Buffer.from('0b00000000000000000000', 'hex') }],
  ])('%s', (_, { value, expected }) => {
    expect(write_amf0(value)).toStrictEqual(expected);
  });

  test('invalid object', () => {
    expect(() => write_amf0(Symbol())).toThrow();
  });

  test('strict array (complex)', () => {
    expect(write_amf0([1 ,'1', {}, true])).toStrictEqual(Buffer.from('0a00000004003ff000000000000002000131030000090101', 'hex'))
  });

  test('object (complex)', () => {
    expect(write_amf0({value: 'key', test: 'ok' })).toStrictEqual(Buffer.from('03000576616c75650200036b65790004746573740200026f6b000009', 'hex'))
  });

  test('string (complex)', () => {
    const value = 'string1'.repeat(10000)
    const encoder = new TextEncoder();
    const array = encoder.encode(value);
    const buffer = Buffer.alloc(5 + array.length);
    buffer.writeUInt8(0xc, 0);
    buffer.writeUInt32BE(array.byteLength, 1);
    buffer.set(array, 5);
    expect(write_amf0(value)).toStrictEqual(buffer);
  });
});
