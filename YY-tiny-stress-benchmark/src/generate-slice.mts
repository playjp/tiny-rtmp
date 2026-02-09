import EBSPBitBuilder from './ebsp-bit-builder.mts'

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
    const height_mb = Math.floor(count / width_mb_length);
    const width_mb = (count % width_mb_length);
    const y_all = (height_mb_lendth * 16) * (width_mb_length * 16);
    const u_all = (height_mb_lendth * 8) * (width_mb_length * 8);
    const y_offset = ((height_mb * width_mb_length) * 16 + width_mb * 16);
    const u_offset = y_all + ((height_mb * width_mb_length) * 8 + width_mb * 8);
    const v_offset = y_all + u_all + ((height_mb * width_mb_length) * 8 + width_mb * 8);

    const y = yuv.subarray(y_offset, y_offset + 16 * 16);
    const u = yuv.subarray(u_offset, u_offset + 8 * 8);
    const v = yuv.subarray(v_offset, v_offset + 8 * 8);
    macroblock_layer(y, u, v, writer);
  }
}

export default (yuv: Buffer, width: number, height: number): Buffer => {
  const writer = new EBSPBitBuilder();

  slice_header(writer);
  slice_data(yuv, width, height, writer);
  rbsp_trailing_bit(writer);

  return writer.build();
};
