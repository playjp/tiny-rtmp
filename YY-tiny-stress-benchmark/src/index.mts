import BitBuilder from "../../03-tiny-http-ts-server/src/bit-builder.mts";

import EBSPBitReader from "../../06-tiny-http-fmp4-server/src/ebsp-bit-reader.mts";
import { read_seq_parameter_set_data, read_pic_parameter_set_data } from "../../06-tiny-http-fmp4-server/src/avc.mts";

import generate_sps from "./generete-sps.mts";
import generate_pps from "./generate-pps.mts";
import generate_slice from "./generate-slice.mts";
import colorbar from "./colorbar.mts";

const width = 128;
const height = 128;
const yuv = colorbar(width, height);

const nal_unit = (nal_unit_type: number) => {
  const writer = new BitBuilder();

  writer.writeBits(0, 1); // forbidden_zero_bit
  writer.writeBits(3, 2); // nal_ref_idc
  writer.writeBits(nal_unit_type, 5); // nal_unit_type

  return writer.build();
};

{
  process.stdout.write(Buffer.from([0x00, 0x00, 0x00, 0x01]))
  process.stdout.write(nal_unit(7 /* SPS */));
  process.stdout.write(generate_sps(width, height));
}
{
  process.stdout.write(Buffer.from([0x00, 0x00, 0x00, 0x01]))
  process.stdout.write(nal_unit(8 /* PPS */));
  process.stdout.write(generate_pps());
}
{
  process.stdout.write(Buffer.from([0x00, 0x00, 0x00, 0x01]))
  process.stdout.write(nal_unit(5 /* IDR */));
  process.stdout.write(generate_slice(yuv, width, height));
}
