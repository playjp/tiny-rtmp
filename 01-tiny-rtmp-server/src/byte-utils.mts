export const insert = (dst: number[], append: number[] | Buffer): void => {
  for (const datum of append) { dst.push(datum); };
};

export const fourcc = (name: string): number[] => {
  return [
    name.charCodeAt(0),
    name.charCodeAt(1),
    name.charCodeAt(2),
    name.charCodeAt(3),
  ];
};

export const uint8 = (value: number): number[] => {
  const unsigned = value < 0 ? 2 ** 8 + value : value;
  return [
    Math.floor(unsigned / 2 ** 0) % (2 ** 8),
  ];
};
export const int8 = uint8;

export const uint16BE = (value: number): number[] => {
  const unsigned = value < 0 ? 2 ** 16 + value : value;
  return [
    Math.floor(unsigned / 2 ** 8) % (2 ** 8),
    Math.floor(unsigned / 2 ** 0) % (2 ** 8)
  ];
};
export const int16BE = uint16BE;

export const uint24BE = (value: number): number[] => {
  const unsigned = value < 0 ? 2 ** 24 + value : value;
  return [
    Math.floor(unsigned / 2 ** 16) % (2 ** 8),
    Math.floor(unsigned / 2 **  8) % (2 ** 8),
    Math.floor(unsigned / 2 **  0) % (2 ** 8),
  ];
};
export const int24BE = uint24BE;

export const uint32BE = (value: number): number[] => {
  const unsigned = value < 0 ? 2 ** 32 + value : value;
  return [
    Math.floor(unsigned / 2 ** 24) % (2 ** 8),
    Math.floor(unsigned / 2 ** 16) % (2 ** 8),
    Math.floor(unsigned / 2 **  8) % (2 ** 8),
    Math.floor(unsigned / 2 **  0) % (2 ** 8),
  ];
};
export const int32BE = uint32BE;

export const uint64BE = (value: number): number[] => {
  return [
    ...uint32BE(Math.floor(value / 2 ** 32) % (2 ** 32)),
    ...uint32BE(Math.floor(value / 2 **  0) % (2 ** 32)),
  ];
};
export const int64BE = uint64BE;

export const floatBE = (value: number): number[] => {
  const buffer = Buffer.from({ length: 4 });
  buffer.writeFloatBE(value);
  return Array.from(buffer);
};

export const doubleBE = (value: number): number[] => {
  const buffer = Buffer.from({ length: 8 });
  buffer.writeDoubleBE(value);
  return Array.from(buffer);
};
