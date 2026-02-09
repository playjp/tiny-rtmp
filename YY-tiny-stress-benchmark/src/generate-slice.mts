import EBSPBitBuilder from './ebsp-bit-builder.mts'

const y_pos = (x: number, y: number, width: number, height: number): number => {
  return y * width + x;
};

const u_pos = (x: number, y: number, width: number, height: number): number => {
  return (height * width) + y * Math.floor(width / 2) + x;
};

const v_pos = (x: number, y: number, width: number, height: number): number => {
  return (height * width) + Math.floor(height * width / 4) + y * Math.floor(width / 2) + x;
};

const rbsp_trailing_bit = (writer: EBSPBitBuilder): void => {
  writer.writeBits(1, 1); // rbsp_stop_one_bit
  writer.writeByteAlign(0); // rbsp_alignment_zero_bit
};

const ref_pic_list_modification = (writer: EBSPBitBuilder): void => {
  // noop
};

const dec_ref_pic_marking = (writer: EBSPBitBuilder): void => {
  writer.writeBool(false); // no_output_of_prior_pics_flag
  writer.writeBool(false); // long_term_reference_flag
}

const slice_header = (writer: EBSPBitBuilder): void => {
  writer.writeUEG(0); // first_mb_in_slice
  writer.writeUEG(7); // slice_type
  writer.writeUEG(0); // pic_parameter_set_id
  writer.writeBits(0, 4); // frame_num
  writer.writeUEG(0); // idr_pic_id
  ref_pic_list_modification(writer);
  dec_ref_pic_marking(writer);
  writer.writeSEG(0); // slice_qp_delta
};

const macroblock_layer = (y: Buffer, u: Buffer, v: Buffer, writer: EBSPBitBuilder): void => {
  writer.writeUEG(25); // mb_type (※ I_PCM = 25)
  writer.writeByteAlign(0); // pcm_alignment_zero_bit
  for (const raw of y) { writer.writeByte(raw); }
  for (const raw of u) { writer.writeByte(raw); }
  for (const raw of v) { writer.writeByte(raw); }
}

const slice_data = (yuv: Buffer, width: number, height: number, writer: EBSPBitBuilder): void => {
  const width_mb_length = Math.ceil(width / 16);
  const height_mb_lendth = Math.ceil(height / 16);
  for (let count = 0; count < width_mb_length * height_mb_lendth; count++) {
    const y_mb = Math.floor(count / width_mb_length);
    const x_mb = (count % width_mb_length);
    const y_data = Buffer.alloc(16 * 16);
    const u_data = Buffer.alloc(8 * 8);
    const v_data = Buffer.alloc(8 * 8);

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        y_data[((y * 2) + 0) * 8 * 2 + (x * 2 + 0)] = yuv[y_pos(x_mb * 16 + (x * 2 + 0), y_mb * 16 + ((y * 2) + 0), width, height)];
        y_data[((y * 2) + 0) * 8 * 2 + (x * 2 + 1)] = yuv[y_pos(x_mb * 16 + (x * 2 + 1), y_mb * 16 + ((y * 2) + 0), width, height)];
        y_data[((y * 2) + 1) * 8 * 2 + (x * 2 + 0)] = yuv[y_pos(x_mb * 16 + (x * 2 + 0), y_mb * 16 + ((y * 2) + 1), width, height)];
        y_data[((y * 2) + 1) * 8 * 2 + (x * 2 + 1)] = yuv[y_pos(x_mb * 16 + (x * 2 + 1), y_mb * 16 + ((y * 2) + 1), width, height)];
        u_data[((y * 1) + 0) * 8 * 1 + (x * 1 + 0)] = yuv[u_pos(x_mb *  8 + (x * 1 + 0), y_mb *  8 + ((y * 1) + 0), width, height)];
        v_data[((y * 1) + 0) * 8 * 1 + (x * 1 + 0)] = yuv[v_pos(x_mb *  8 + (x * 1 + 0), y_mb *  8 + ((y * 1) + 0), width, height)];
      }
    }

    macroblock_layer(y_data, u_data, v_data, writer);
  }
}

export default (yuv: Buffer, width: number, height: number): Buffer => {
  const writer = new EBSPBitBuilder();

  slice_header(writer);
  slice_data(yuv, width, height, writer);
  rbsp_trailing_bit(writer);

  return writer.build();
};
