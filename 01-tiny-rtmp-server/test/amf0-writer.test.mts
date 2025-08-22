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
});
