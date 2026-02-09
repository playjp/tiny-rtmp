import EBSPBitBuilder from './ebsp-bit-builder.mts'

const rbsp_trailing_bit = (writer: EBSPBitBuilder): void => {
  writer.writeBits(1, 1); // rbsp_stop_one_bit
  writer.writeByteAlign(0); // rbsp_alignment_zero_bit
};

const pic_parameter_set_data = (writer: EBSPBitBuilder): void => {
  writer.writeUEG(0); // pic_parameter_set_id
  writer.writeUEG(0); // seq_parameter_set_id
  writer.writeBool(false); // entropy_coding_mode_flag
  writer.writeBool(false); // bottom_field_pic_order_in_frame_present_flag
  writer.writeUEG(0); // num_slice_groups_minus1
  writer.writeUEG(0); // num_ref_idx_l0_default_active_minus1
  writer.writeUEG(0); // num_ref_idx_l1_default_active_minus1
  writer.writeBool(false); // weighted_pred_flag
  writer.writeBits(0, 2); // weighted_bipred_idc
  writer.writeSEG(0); // pic_init_qp_minus26 (※ PCM を使うので利用しない)
  writer.writeSEG(0); // pic_init_qs_minus26 (※ PCM を使うので利用しない)
  writer.writeSEG(0); // chroma_qp_index_offset (※ PCM を使うので利用しない)
  writer.writeBool(false); // deblocking_filter_control_present_flag
  writer.writeBool(false); // constrained_intra_pred_flag
  writer.writeBool(false); // redundant_pic_cnt_present_flag
};

export default (): Buffer => {
  const writer = new EBSPBitBuilder();

  pic_parameter_set_data(writer);
  rbsp_trailing_bit(writer);

  return writer.build();
};
