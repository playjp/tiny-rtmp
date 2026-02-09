import EBSPBitBuilder from './ebsp-bit-builder.mts'

const rbsp_trailing_bit = (writer: EBSPBitBuilder): void => {
  writer.writeBits(1, 1); // rbsp_stop_one_bit
  writer.writeByteAlign(0); // rbsp_alignment_zero_bit
};

const seq_parameter_set_data = (width: number, height: number, writer: EBSPBitBuilder): void => {
  writer.writeBits(66, 8); // profile_idc
  writer.writeBits(0, 6); // constraint_set_flag
  writer.writeBits(0, 2); // reserved_zero_2bits
  writer.writeBits(52 /* 5.2 */, 8); // level_idc
  writer.writeUEG(0); // seq_parameter_set_id
  writer.writeUEG(0); // log2_max_frame_num_minus4
  writer.writeUEG(2); // pic_order_cnt_type
  writer.writeUEG(0); // max_num_ref_frames
  writer.writeBool(false); // gaps_in_frame_num_value_allowed_flag
  writer.writeUEG(Math.ceil(width / 16) - 1); // pic_width_in_mbs_minus1
  writer.writeUEG(Math.ceil(height / 16) - 1); // pic_height_in_map_units_minus1
  writer.writeBool(true); // frame_mbs_only_flag
  writer.writeBool(true); // direct_8x8_inference_flag
  writer.writeBool(false); // frame_cropping_flag
  writer.writeBool(false); // vui_parameters_present_flag
};

export default (width: number, height: number): Buffer => {
  const writer = new EBSPBitBuilder();

  seq_parameter_set_data(width, height, writer);
  rbsp_trailing_bit(writer);

  return writer.build();
};
