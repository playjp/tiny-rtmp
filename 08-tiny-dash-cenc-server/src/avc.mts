import crypto from 'node:crypto';

import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';
import ByteBuilder from '../../01-tiny-rtmp-server/src/byte-builder.mts';
import { read_avc_decoder_configuration_record, type AVCDecoderConfigurationRecord } from '../../03-tiny-http-ts-server/src/avc.mts';
import BitReader from '../../03-tiny-http-ts-server/src/bit-reader.mts';
import { is_idr_nal, read_nal_unit_header, read_pic_parameter_set_data, read_seq_parameter_set_data, strip_nal_unit_header, sufficient_bits, type SequenceParameterSet } from '../../06-tiny-http-fmp4-server/src/avc.mts';
import EBSPBitReader from '../../06-tiny-http-fmp4-server/src/ebsp-bit-reader.mts';
import { avcC, make, track } from '../../06-tiny-http-fmp4-server/src/fmp4.mts';
import { EncryptionFormat, EncryptionScheme, encv, frma, IVType, padIV, schi, schm, sinf, tenc, type EncryptionFormatCBCS, type EncryptionFormatCENC, type SubsampleInformation } from './cenc.mts';

export const SliceType = {
  P: 0,
  B: 1,
  I: 2,
  SP: 3,
  SI: 4,
} as const;
export const is_target_slice_type = (slice_type: number, target: (typeof SliceType)[keyof typeof SliceType]): boolean => {
  return (slice_type % 5) === target;
};
export const is_p_slice = (slice_type: number): boolean => {
  return is_target_slice_type(slice_type, SliceType.P);
};
export const is_b_slice = (slice_type: number): boolean => {
  return is_target_slice_type(slice_type, SliceType.B);
};
export const is_i_slice = (slice_type: number): boolean => {
  return is_target_slice_type(slice_type, SliceType.I);
};
export const is_sp_slice = (slice_type: number): boolean => {
  return is_target_slice_type(slice_type, SliceType.SP);
};
export const is_si_slice = (slice_type: number): boolean => {
  return is_target_slice_type(slice_type, SliceType.SI);
};

const skip_ref_pic_list_modification = (slice_type: number, reader: BitReader): void => {
  if (!is_i_slice(slice_type) && !is_si_slice(slice_type)) {
    const ref_pic_list_modification_flag_l0 = reader.readBool();
    if (ref_pic_list_modification_flag_l0) {
      while (true) {
        const modification_of_pic_nums_idc = reader.readUEG();
        if (modification_of_pic_nums_idc === 3) { break; }

        if (modification_of_pic_nums_idc === 0 || modification_of_pic_nums_idc === 1) {
          reader.skipUEG(); // abs_diff_pic_num_minus1
        } else if (modification_of_pic_nums_idc === 2) {
          reader.skipUEG(); // long_term_pic_num
        }
      }
    }
  }
  if (is_b_slice(slice_type)) {
    const ref_pic_list_modification_flag_l1 = reader.readBool();
    if (ref_pic_list_modification_flag_l1) {
      while (true) {
        const modification_of_pic_nums_idc = reader.readUEG();
        if (modification_of_pic_nums_idc === 3) { break; }

        if (modification_of_pic_nums_idc === 0 || modification_of_pic_nums_idc === 1) {
          reader.skipUEG(); // abs_diff_pic_num_minus1
        } else if (modification_of_pic_nums_idc === 2) {
          reader.skipUEG(); // long_term_pic_num
        }
      }
    }
  }
};

const skip_ref_pic_list_mvc_modification = (slice_type: number, reader: BitReader): void => {
  if (!is_i_slice(slice_type) && !is_si_slice(slice_type)) {
    const ref_pic_list_modification_flag_l0 = reader.readBool();
    if (ref_pic_list_modification_flag_l0) {
      while (true) {
        const modification_of_pic_nums_idc = reader.readUEG();
        if (modification_of_pic_nums_idc === 3) { break; }

        if (modification_of_pic_nums_idc === 0 || modification_of_pic_nums_idc === 1) {
          reader.skipUEG(); // abs_diff_pic_num_minus1
        } else if (modification_of_pic_nums_idc === 2) {
          reader.skipUEG(); // long_term_pic_num
        } else if (modification_of_pic_nums_idc === 4 || modification_of_pic_nums_idc === 5) {
          reader.skipUEG(); // abs_diff_view_idx_minus1
        }
      }
    }
  }
  if (is_b_slice(slice_type)) {
    const ref_pic_list_modification_flag_l1 = reader.readBool();
    if (ref_pic_list_modification_flag_l1) {
      while (true) {
        const modification_of_pic_nums_idc = reader.readUEG();
        if (modification_of_pic_nums_idc === 3) { break; }

        if (modification_of_pic_nums_idc === 0 || modification_of_pic_nums_idc === 1) {
          reader.skipUEG(); // abs_diff_pic_num_minus1
        } else if (modification_of_pic_nums_idc === 2) {
          reader.skipUEG(); // long_term_pic_num
        } else if (modification_of_pic_nums_idc === 4 || modification_of_pic_nums_idc === 5) {
          reader.skipUEG(); // abs_diff_view_idx_minus1
        }
      }
    }
  }
};

const skip_pred_weight_table = (slice_type: number, num_ref_idx_l0_active_minus1: number, num_ref_idx_l1_active_minus1: number, sps: SequenceParameterSet, reader: BitReader): void => {
  reader.skipUEG(); // luma_log2_weight_denom
  const chroma_array_type = sps.separate_colour_plane_flag ? 0 : sps.chroma_format_idc;
  if (chroma_array_type !== 0) {
    reader.skipUEG(); // chroma_log2_weight_denom
  }
  for (let i = 0; i <= num_ref_idx_l0_active_minus1; i++) {
    const luma_weight_l0_flag = reader.readBool();
    if (luma_weight_l0_flag) {
      reader.skipSEG(); // luma_weight_l0[i]
      reader.skipSEG(); // luma_offset_l0[i]
    }
    if (chroma_array_type !== 0) {
      const chroma_weight_l0_flag = reader.readBool();
      if (chroma_weight_l0_flag) {
        for (let j = 0; j < 2; j++) {
          reader.skipSEG(); // chroma_weight_l0[i][j]
          reader.skipSEG(); // chroma_offset_l0[i][j];
        }
      }
    }
  }
  if (is_b_slice(slice_type)) {
    for (let i = 0; i <= num_ref_idx_l1_active_minus1; i++) {
      const luma_weight_l1_flag = reader.readBool();
      if (luma_weight_l1_flag) {
        reader.skipSEG(); // luma_weight_l1[i]
        reader.skipSEG(); // luma_offset_l1[i]
      }
      if (chroma_array_type !== 0) {
        const chroma_weight_l1_flag = reader.readBool();
        if (chroma_weight_l1_flag) {
          for (let j = 0; j < 2; j++) {
            reader.skipSEG(); // chroma_weight_l1[i][j]
            reader.skipSEG(); // chroma_offset_l1[i][j];
          }
        }
      }
    }
  }
};

const skip_dec_ref_pic_marking = (nal_unit_type: number, reader: BitReader): void => {
  if (is_idr_nal(nal_unit_type)) {
    reader.skipBool(); // no_output_of_prior_pics_flag
    reader.skipBool(); // long_term_reference_flag
  } else {
    const adaptive_ref_pic_marking_mode_flag = reader.readBool();
    if (adaptive_ref_pic_marking_mode_flag) {
      while (true) {
        const memory_management_control_operation = reader.readUEG();
        if (memory_management_control_operation === 0) { break; }

        if (memory_management_control_operation === 1 || memory_management_control_operation === 3) {
          reader.skipUEG(); // difference_of_pic_nums_minus1
        }
        if (memory_management_control_operation === 2) {
          reader.skipUEG(); // long_term_pic_num
        }
        if (memory_management_control_operation === 3 || memory_management_control_operation === 6) {
          reader.skipUEG(); // long_term_frame_idx
        }
        if (memory_management_control_operation === 4) {
          reader.skipUEG(); // max_long_term_frame_idx_plus1
        }
      }
    }
  }
};

export const skip_slice_header = (nal_ref_idc: number, nal_unit_type: number, reader: BitReader, all_sps: Buffer[], all_pps: Buffer[]): void => {
  const ssps = all_sps.map((sps) => read_seq_parameter_set_data(strip_nal_unit_header(sps)));
  const ppps = all_pps.map((pps) => read_pic_parameter_set_data(strip_nal_unit_header(pps)));

  reader.skipUEG(); // first_mb_in_slice
  const slice_type = reader.readUEG();
  const pic_parameter_set_id = reader.readUEG();
  // TODO: ほんとは当てはまらない再生できないやつをエラーさせるべき
  const pps = ppps.find((pps) => pps.pic_parameter_set_id === pic_parameter_set_id)!;
  const sps = ssps.find((sps) => sps.seq_parameter_set_id === pps.seq_parameter_set_id)!;

  if (sps.separate_colour_plane_flag) {
    reader.skipBits(2); // colour_plane_id
  }
  reader.skipBits(sps.log2_max_frame_num_minus4 + 4); // frame_num
  let field_pic_flag = false;
  if (!sps.frame_mbs_only_flag) {
    field_pic_flag = reader.readBool();
    if (field_pic_flag) {
      reader.skipBool(); // bottom_field_flag
    }
  }
  if (is_idr_nal(nal_unit_type)) { // IdrPicFlag
    reader.skipUEG(); // idr_pic_id
  }
  if (sps.has_log2_max_pic_order_cnt_lsb_minus4) {
    reader.skipBits(sps.log2_max_pic_order_cnt_lsb_minus4 + 4);
    if (pps.bottom_field_pic_order_in_frame_present_flag && !field_pic_flag) {
      reader.skipSEG(); // delta_pic_order_cnt_bottom
    }
  }
  if (sps.has_delta_pic_order_always_zero_flag && !sps.delta_pic_order_always_zero_flag) {
    reader.skipSEG(); // delta_pic_order_cnt[0]
    if (pps.bottom_field_pic_order_in_frame_present_flag && !field_pic_flag) {
      reader.skipSEG(); // delta_pic_order_cnt[1]
    }
  }
  if (pps.redundant_pic_cnt_present_flag) {
    reader.skipUEG(); // redundant_pic_cnt
  }

  if (is_target_slice_type(slice_type, SliceType.B)) {
    reader.skipBool(); // direct_spatial_mv_pred_flag
  }
  let num_ref_idx_l0_active_minus1 = pps.num_ref_idx_l0_default_active_minus1;
  let num_ref_idx_l1_active_minus1 = pps.num_ref_idx_l1_default_active_minus1;
  if (is_p_slice(slice_type) || is_sp_slice(slice_type) || is_b_slice(slice_type)) {
    const num_ref_idx_active_override_flag = reader.readBool();
    if (num_ref_idx_active_override_flag) {
      num_ref_idx_l0_active_minus1 = reader.readUEG(); // num_ref_idx_l0_active_minus1
      if (is_b_slice(slice_type)) {
        num_ref_idx_l1_active_minus1 = reader.readUEG(); // num_ref_idx_l1_active_minus1
      }
    }
  }

  if (nal_unit_type === 20 || nal_unit_type === 21) { /* specified in Annex H */
    skip_ref_pic_list_mvc_modification(slice_type, reader);
  } else {
    skip_ref_pic_list_modification(slice_type, reader);
  }

  if((pps.weighted_pred_flag && (is_p_slice(slice_type) || is_sp_slice(slice_type))) || (pps.weighted_bipred_idc === 1 && is_b_slice(slice_type))) {
    skip_pred_weight_table(slice_type, num_ref_idx_l0_active_minus1, num_ref_idx_l1_active_minus1, sps, reader);
  }
  if(nal_ref_idc !== 0) {
    skip_dec_ref_pic_marking(nal_unit_type, reader);
  }
  if(pps.entropy_coding_mode_flag && !is_i_slice(slice_type) && !is_si_slice(slice_type)) {
    reader.skipUEG(); // cabac_init_idc
  }
  reader.skipSEG(); // slice_qp_delta
  if (is_sp_slice(slice_type) || is_si_slice(slice_type)) {
    if (is_sp_slice(slice_type)) {
      reader.skipBool(); // sp_for_switch_flag
    }
    reader.skipSEG(); //slice_qs_delta
  }
  if(pps.deblocking_filter_control_present_flag) {
    const disable_deblocking_filter_idc = reader.readUEG(); // disable_deblocking_filter_idc
    if (disable_deblocking_filter_idc !== 1) {
      reader.skipSEG(); // slice_alpha_c0_offset_div2
      reader.skipSEG(); // slice_beta_offset_div2
    }
  }
  if (pps.has_slice_group_map_type && pps.has_slice_group_change_rate_minus1) {
    const slice_group_change_cycle_bits = sufficient_bits(sps.pic_size_in_map_units / (pps.slice_group_change_rate_minus1 + 1));
    reader.skipBits(slice_group_change_cycle_bits);
  }
};

export const write_mp4_avc_track_information = (track_id: number, timescale: number, encryptionFormat: EncryptionFormat, ivType: IVType, keyId: Buffer, avc_decoder_configuration_record: Buffer): Buffer => {
  const { SequenceParameterSets } = read_avc_decoder_configuration_record(avc_decoder_configuration_record);
  const sps = SequenceParameterSets[0];
  const { resolution, vui_parameters: { source_aspect_ratio } } = read_seq_parameter_set_data(strip_nal_unit_header(sps));

  const presentation = [
    Math.floor(resolution[0] * source_aspect_ratio[0] / source_aspect_ratio[1]),
    resolution[1],
  ];

  return make((vector) => {
    track(track_id, presentation[0], presentation[1], timescale, 'vide', vector, (vector) => {
      encv(resolution[0], resolution[1], vector, (vector) => {
        avcC(avc_decoder_configuration_record, vector);
        sinf(vector, (vector) => {
          frma('avc1', vector);
          schm(encryptionFormat.scheme, 0x10000, vector);
          schi(vector, (vector) => {
            tenc(encryptionFormat, keyId, ivType, vector);
          });
        });
      });
    });
  });
};

export const encrypt_avc_cenc = (format: EncryptionFormatCENC, key: Buffer, iv: Buffer, sizedNalus: Buffer, avcDecoderConfigurationRecord: AVCDecoderConfigurationRecord): [Buffer, SubsampleInformation[]] => {
  // IV のビット数が少ない場合は 0 埋めして合わせる
  iv = padIV(format, iv);
  // NALu は Sub-Sample Encryption
  const cipher = crypto.createCipheriv(format.algorithm, key, iv);
  const builder = new ByteBuilder();
  const nalu_reader = new ByteReader(sizedNalus);

  const subsamples: SubsampleInformation[] = [];
  while (!nalu_reader.isEOF()) {
    const naluLengthSize = avcDecoderConfigurationRecord.lengthSize;
    const length = nalu_reader.readUIntBE(naluLengthSize);
    const nalu = nalu_reader.read(length);

    const { nal_ref_idc, nal_unit_type, consumed_bytes } = read_nal_unit_header(nalu);
    const bit_reader = new EBSPBitReader(nalu.subarray(consumed_bytes));
    const isVCL = 1 <= nal_unit_type && nal_unit_type <= 5;

    builder.writeUIntBE(length, avcDecoderConfigurationRecord.lengthSize);
    if (isVCL) {
      // CENCv3 から slice_header は clear である必要がある
      // CENCv1 では そのような記載がないため nal header くらいがあれば十分
      skip_slice_header(nal_ref_idc, nal_unit_type, bit_reader, avcDecoderConfigurationRecord.SequenceParameterSets, avcDecoderConfigurationRecord.PictureParameterSets);
      const clearBytes = consumed_bytes + Math.floor((bit_reader.consumedBits() + 8 - 1) / 8);
      builder.write(nalu.subarray(0, clearBytes));

      const update = cipher.update(nalu.subarray(clearBytes));
      builder.write(update);

      subsamples.push([naluLengthSize + clearBytes, update.byteLength]);
    } else {
      builder.write(nalu);
      for (let i = 0; i < naluLengthSize + length; i += 0xFFFF) {
        subsamples.push([Math.min(0xFFFF, (naluLengthSize + length) - i), 0]);
      }
    }
  }

  return [builder.build(), subsamples];
};

export const encrypt_avc_cbcs = (format: EncryptionFormatCBCS, key: Buffer, iv: Buffer, sizedNalus: Buffer, avcDecoderConfigurationRecord: AVCDecoderConfigurationRecord): [Buffer, SubsampleInformation[]] => {
  // IV のビット数が少ない場合は 0 埋めして合わせる
  iv = padIV(format, iv);
  // NALu は Sub-Sample かつ Pattern Encryption
  const builder = new ByteBuilder();
  const nalu_reader = new ByteReader(sizedNalus);

  const subsamples: SubsampleInformation[] = [];
  while (!nalu_reader.isEOF()) {
    const cipher = crypto.createCipheriv(format.algorithm, key, iv);
    const naluLengthSize = avcDecoderConfigurationRecord.lengthSize;
    const length = nalu_reader.readUIntBE(naluLengthSize);
    const nalu = nalu_reader.read(length);

    const { nal_ref_idc, nal_unit_type, consumed_bytes } = read_nal_unit_header(nalu);
    const bit_reader = new EBSPBitReader(nalu.subarray(consumed_bytes));
    const isVCL = 1 <= nal_unit_type && nal_unit_type <= 5;

    builder.writeUIntBE(length, avcDecoderConfigurationRecord.lengthSize);
    if (isVCL) {
      // CENCv3 から slice_header は clear である必要がある
      // CENCv1 では そのような記載がないため nal header くらいがあれば十分
      skip_slice_header(nal_ref_idc, nal_unit_type, bit_reader, avcDecoderConfigurationRecord.SequenceParameterSets, avcDecoderConfigurationRecord.PictureParameterSets);
      const clearBytes = consumed_bytes + Math.floor((bit_reader.consumedBits() + 8 - 1) / 8);
      builder.write(nalu.subarray(0, clearBytes));

      const target = nalu.subarray(clearBytes);
      let offset = 0;
      while (offset < target.byteLength) {
        const [crypt, clear] = format.pattern;
        for (let i = 0; i < crypt; i++) {
          if (offset + format.bytes <= target.byteLength) {
            builder.write(cipher.update(target.subarray(offset, offset + format.bytes)));
            offset += format.bytes;
          }
        }
        for (let i = 0; i < clear; i++) {
          if (offset < target.byteLength) {
            const next = Math.min(target.byteLength, offset + format.bytes);
            builder.write(target.subarray(offset, next));
            offset = next;
          }
        }
      }
      subsamples.push([naluLengthSize + clearBytes, target.byteLength]);
    } else {
      builder.write(nalu);
      for (let i = 0; i < naluLengthSize + length; i += 0xFFFF) {
        subsamples.push([Math.min(0xFFFF, (naluLengthSize + length) - i), 0]);
      }
    }
  }

  return [builder.build(), subsamples];
};

export const encrypt_avc = (format: EncryptionFormat, key: Buffer, iv: Buffer, sizedNalus: Buffer, avcDecoderConfigurationRecord: AVCDecoderConfigurationRecord): [Buffer, SubsampleInformation[]] => {
  switch (format.scheme) {
    case EncryptionScheme.CENC: return encrypt_avc_cenc(format, key, iv, sizedNalus, avcDecoderConfigurationRecord);
    case EncryptionScheme.CBCS: return encrypt_avc_cbcs(format, key, iv, sizedNalus, avcDecoderConfigurationRecord);
  }
};
