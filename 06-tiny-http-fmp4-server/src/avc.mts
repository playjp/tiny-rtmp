import ByteBuilder from '../../01-tiny-rtmp-server/src/byte-builder.mts';
import { read_avc_decoder_configuration_record } from '../../03-tiny-http-ts-server/src/avc.mts';
import BitReader from '../../03-tiny-http-ts-server/src/bit-reader.mts';
import EBSPBitReader from './ebsp-bit-reader.mts';
import { avc1, avcC, make, track } from './mp4.mts';

export type NALUnitHeader = {
  nal_ref_idc: number;
  nal_unit_type: number;
  consumed_bytes: number;
};

export const is_idr_nal = (nal_unit_type: number): boolean => {
  return nal_unit_type === 5;
}

const skip_nal_unit_header_svc_extension = (reader: BitReader): void => {
  reader.skipBool(); // idr_flag
  reader.skipBits(6); // priority_id
  reader.skipBool(); // no_inter_layer_pred_flag
  reader.skipBits(3); // dependency_id
  reader.skipBits(4); // quality_id
  reader.skipBits(3); // temporal_id
  reader.skipBool(); // use_ref_base_pic_flag
  reader.skipBool(); // discardable_flag
  reader.skipBool(); // output_flag
  reader.skipBits(2); // reserved_three_2bits
};

const skip_nal_unit_header_3davc_extension = (reader: BitReader): void => {
  reader.skipBits(8); // view_idx
  reader.skipBool(); // depth_flag
  reader.skipBool(); // non_idr_flag
  reader.skipBits(3); // temporal_id
  reader.skipBool(); // anchor_pic_flag
  reader.skipBool(); // inter_view_flag
};

const skip_nal_unit_header_mvc_extension = (reader: BitReader): void => {
  reader.skipBool(); // non_idr_flag
  reader.skipBits(6); // priority_id
  reader.skipBits(10); // view_id
  reader.skipBits(3); // temporal_id
  reader.skipBool(); // anchor_pic_flag
  reader.skipBool(); // inter_view_flag
  reader.skipBits(1); // reserved_one_bit
};

export const read_nal_unit_header = (nalu: Buffer): NALUnitHeader => {
  const reader = new BitReader(nalu);
  reader.skipBits(1); // forbidden_zero_bit
  const nal_ref_idc = reader.readBits(2);
  const nal_unit_type = reader.readBits(5);

  if (nal_unit_type === 14 || nal_unit_type === 20 || nal_unit_type === 21) {
    const { svc_extension_flag, avc_3d_extension_flag } = (() => {
      if (nal_unit_type !== 21) {
        return { svc_extension_flag: reader.readBool(), avc_3d_extension_flag: false };
      } else {
        return { svc_extension_flag: false, avc_3d_extension_flag: reader.readBool() };
      }
    })();

    if (svc_extension_flag) {
      skip_nal_unit_header_svc_extension(reader);
    } else if (avc_3d_extension_flag) {
      skip_nal_unit_header_3davc_extension(reader);
    } else {
      skip_nal_unit_header_mvc_extension(reader);
    }
    reader.skipByteAlign();
  }

  return {
    nal_ref_idc,
    nal_unit_type,
    consumed_bytes: Math.floor((reader.consumedBits() + 8 - 1) / 8),
  };
}

export const strip_nal_unit_header = (nalu: Buffer): EBSPBitReader => {
  const { consumed_bytes } = read_nal_unit_header(nalu);
  return new EBSPBitReader(nalu.subarray(consumed_bytes));
}

const profile_idc_with_chroma_info_set = new Set<number>([
  100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135,
]);
const aspect_ratio_table = [
  [Number.NaN, Number.NaN], // 0: Unspecified
  [1, 1],
  [12, 11],
  [10, 11],
  [16, 11],
  [40, 33],
  [24, 11],
  [20, 11],
  [32, 11],
  [80, 33],
  [18, 11],
  [15, 11],
  [64, 33],
  [160, 99],
  [4, 3],
  [3, 2],
  [2, 1],
] as const satisfies [number, number][];

const read_hrd_parameters = (reader: BitReader): void => {
  const cpb_cnt_minus1 = reader.readUEG();
  const bit_rate_scale = reader.readBits(4);
  const cpb_size_scale = reader.readBits(4);
  for(let SchedSelIdx = 0; SchedSelIdx <= cpb_cnt_minus1; SchedSelIdx++) {
    const bit_rate_value_minus1/*[SchedSelIdx]*/ = reader.readUEG();
    const cpb_size_value_minus1/*[SchedSelIdx]*/ = reader.readUEG();
    const cbr_flag/*[SchedSelIdx]*/ = reader.readBool();
  }
  const initial_cpb_removal_delay_length_minus1 = reader.readBits(5);
  const cpb_removal_delay_length_minus1 = reader.readBits(5);
  const dpb_output_delay_length_minus1 = reader.readBits(5);
  const time_offset_length = reader.readBits(5);
};

export type VUIParameters = {
  source_aspect_ratio: [number, number];
  timing_info?: {
    numer: number;
    denom: number;
    fixed_rate: boolean;
  };
};

const read_vui_parameters = (reader: BitReader): VUIParameters => {
  const aspect_ratio_info_present_flag = reader.readBool();
  const source_aspect_ratio = (() => {
    if (aspect_ratio_info_present_flag) {
      const aspect_ratio_idc = reader.readBits(8);
      if (aspect_ratio_idc === 0xFF) {
        return [reader.readBits(16), reader.readBits(16)] satisfies [number, number];
      } else if (0 <= aspect_ratio_idc && aspect_ratio_idc <= 16) {
        return aspect_ratio_table[aspect_ratio_idc];
      } else {
        return [Number.NaN, Number.NaN] satisfies [number, number];
      }
    } else {
      return [1, 1] satisfies [number, number];
    }
  })();
  const overscan_info_present_flag = reader.readBool();
  if (overscan_info_present_flag) {
    const overscan_appropriate_flag = reader.readBool();
  }
  const video_signal_type_present_flag = reader.readBool();
  if (video_signal_type_present_flag) {
    const video_format = reader.readBits(3);
    const video_full_range_flag = reader.readBool();
    const colour_description_present_flag = reader.readBool();
    if (colour_description_present_flag) {
      const colour_primaries = reader.readBits(8);
      const transfer_characteristics = reader.readBits(8);
      const matrix_coefficients = reader.readBits(8);
    }
  }
  const chroma_loc_info_present_flag = reader.readBool();
  if(chroma_loc_info_present_flag) {
    const chroma_sample_loc_type_top_field = reader.readUEG();
    const chroma_sample_loc_type_bottom_field = reader.readUEG();
  }
  const timing_info_present_flag = reader.readBool();
  const timing_info = (() => {
    if (!timing_info_present_flag) { return undefined; }
    const num_units_in_tick = reader.readBits(32);
    const time_scale = reader.readBits(32);
    const fixed_frame_rate_flag = reader.readBool();
    return {
      numer: num_units_in_tick,
      denom: time_scale,
      fixed_rate: fixed_frame_rate_flag,
    };
  })();
  const nal_hrd_parameters_present_flag = reader.readBool();
  if (nal_hrd_parameters_present_flag) {
    read_hrd_parameters(reader);
  }
  const vcl_hrd_parameters_present_flag = reader.readBool();
  if (vcl_hrd_parameters_present_flag) {
    read_hrd_parameters(reader);
  }
  if (nal_hrd_parameters_present_flag || vcl_hrd_parameters_present_flag) {
    const low_delay_hrd_flag = reader.readBool();
  }
  const pic_struct_present_flag = reader.readBool();
  const bitstream_restriction_flag = reader.readBool();
  if (bitstream_restriction_flag) {
    const motion_vectors_over_pic_boundaries_flag = reader.readBool();
    const max_bytes_per_pic_denom = reader.readUEG();
    const max_bits_per_mb_denom = reader.readUEG();
    const log2_max_mv_length_horizontal = reader.readUEG();
    const log2_max_mv_length_vertical = reader.readUEG();
    const max_num_reorder_frames = reader.readUEG();
    const max_dec_frame_buffering = reader.readUEG();
  }

  return {
    source_aspect_ratio,
    timing_info,
  };
};

const read_scaling_list = (sizeOfScalingList: number, reader: BitReader): void => {
  let lastScale = 8, nextScale = 8;
  for (let j = 0; j < sizeOfScalingList; j++) {
    if (nextScale !== 0) {
      const delta_scale = reader.readSEG();
      nextScale = (lastScale + delta_scale + 256) % 256;
      // useDefaultScalingMatrixFlag = (j === 0 && nextScale === 0);
    }
    // scalingList[j] = (nextScale === 0) ? lastScale : nextScale
    lastScale = (nextScale === 0) ? lastScale : nextScale;
  }
};

type PicOrderCntType = ({
  // 0
  has_log2_max_pic_order_cnt_lsb_minus4: true; // マーカーのために勝手に定義してる
  has_delta_pic_order_always_zero_flag: false; // マーカーのために勝手に定義してる
  log2_max_pic_order_cnt_lsb_minus4: number
} | {
  has_log2_max_pic_order_cnt_lsb_minus4: false; // マーカーのために勝手に定義してる
  has_delta_pic_order_always_zero_flag: true; // マーカーのために勝手に定義してる
  delta_pic_order_always_zero_flag: boolean;
} | {
  has_log2_max_pic_order_cnt_lsb_minus4: false,
  has_delta_pic_order_always_zero_flag: false
});

export const sufficient_bits = (value: number): number => {
  let bits = 0;
  while (value >= 2 ** bits) {
    bits += 1;
  }
  return bits;
};

// slice header のパースで使うもの
type SliceHeaderRequiredData = {
  separate_colour_plane_flag: boolean;
  pic_size_in_map_units: number;
  frame_mbs_only_flag: boolean;
  log2_max_frame_num_minus4: number
} & PicOrderCntType;

export type SequenceParameterSet = {
  // 大体必要なやつ
  seq_parameter_set_id: number;
  profile_idc: number;
  constraint_set_flag: number;
  level_idc: number;
  bit_depth: { luma: number; chroma: number; };
  chroma_format_idc: number;
  resolution: [number, number];
  vui_parameters: VUIParameters;
} & SliceHeaderRequiredData; // slice header のパースで使うもの

export const read_seq_parameter_set_data = (reader: BitReader): SequenceParameterSet => {
  const profile_idc = reader.readBits(8);
  const constraint_set_flag = reader.readBits(8);
  const level_idc = reader.readBits(8);
  const seq_parameter_set_id = reader.readUEG();

  const { chroma_format_idc, bit_depth, separate_colour_plane_flag } = (() => {
    if (profile_idc_with_chroma_info_set.has(profile_idc)) {
      let separate_colour_plane_flag = false;
      const chroma_format_idc = reader.readUEG();
      if (chroma_format_idc === 3) {
        separate_colour_plane_flag = reader.readBool();
      }
      const bit_depth_luma_minus8 = reader.readUEG();
      const bit_depth_chroma_minus8 = reader.readUEG();
      const qpprime_y_zero_transform_bypass_flag = reader.readBool();
      const seq_scaling_matrix_present_flag = reader.readBool();
      if (seq_scaling_matrix_present_flag) {
        for (let i = 0; i < (chroma_format_idc !== 3 ? 8 : 12); i++) {
          const seq_scaling_list_present_flag = reader.readBool();
          if (seq_scaling_list_present_flag) {
            if (i < 6) {
              read_scaling_list(16, reader);
            } else {
              read_scaling_list(64, reader);
            }
          }
        }
      }
      return {
        chroma_format_idc,
        bit_depth: { luma: bit_depth_luma_minus8 + 8, chroma: bit_depth_chroma_minus8 + 8 },
        separate_colour_plane_flag,
      };
    } else {
      return {
        chroma_format_idc: 1,
        bit_depth: { luma: 8, chroma: 8 },
        separate_colour_plane_flag: false,
      };
    }
  })();
  const log2_max_frame_num_minus4 = reader.readUEG();
  const log2_max_pic_order_cnt_lsb_minus4 = ((): PicOrderCntType => {
    const pic_order_cnt_type = reader.readUEG();
    if (pic_order_cnt_type === 0) {
      const log2_max_pic_order_cnt_lsb_minus4 = reader.readUEG();
      return {
        has_log2_max_pic_order_cnt_lsb_minus4: true,
        has_delta_pic_order_always_zero_flag: false,
        log2_max_pic_order_cnt_lsb_minus4
      } as const;
    } else if (pic_order_cnt_type === 1) {
      const delta_pic_order_always_zero_flag = reader.readBool();
      const offset_for_non_ref_pic = reader.readSEG();
      const offset_for_top_to_bottom_field = reader.readSEG();
      const num_ref_frames_in_pic_order_cnt_cycle = reader.readUEG();
      for (let i = 0; i < num_ref_frames_in_pic_order_cnt_cycle; i++) {
        const offset_for_ref_frame = reader.readSEG();
      }
      return {
        has_log2_max_pic_order_cnt_lsb_minus4: false,
        has_delta_pic_order_always_zero_flag: true,
        delta_pic_order_always_zero_flag,
      } as const;
    } else {
      return {
        has_log2_max_pic_order_cnt_lsb_minus4: false,
        has_delta_pic_order_always_zero_flag: false,
      } as const;
    }
  })();
  const max_num_ref_frames = reader.readUEG();
  const gaps_in_frame_num_value_allowed_flag  = reader.readBool();
  const pic_width_in_mbs_minus1 = reader.readUEG();
  const pic_height_in_map_units_minus1 = reader.readUEG();
  const frame_mbs_only_flag = reader.readBool();
  if (!frame_mbs_only_flag) {
    const mb_adaptive_frame_field_flag = reader.readBool();
  }
  const direct_8x8_inference_flag = reader.readBool();
  const frame_cropping_flag = reader.readBool();
  const frame_crop_left_offset = frame_cropping_flag ? reader.readUEG() : 0;
  const frame_crop_right_offset  = frame_cropping_flag ? reader.readUEG() : 0;
  const frame_crop_top_offset  = frame_cropping_flag ? reader.readUEG() : 0;
  const frame_crop_bottom_offset  = frame_cropping_flag ? reader.readUEG() : 0;
  const vui_parameters_present_flag = reader.readBool();
  const vui_parameters = vui_parameters_present_flag ? read_vui_parameters(reader) : {
    source_aspect_ratio: [1, 1], // default
  } satisfies VUIParameters;

  const SubWidthC = chroma_format_idc === 3 ? 1 : 2;
  const SubHeightC = chroma_format_idc <= 1 ? 2 : 1;
  const width = (pic_width_in_mbs_minus1 + 1) * 16 - SubWidthC * (frame_crop_left_offset + frame_crop_right_offset);
  const height = ((pic_height_in_map_units_minus1 + 1) * 16  - SubHeightC * (frame_crop_top_offset + frame_crop_bottom_offset)) * (frame_mbs_only_flag ? 1 : 2);

  return {
    seq_parameter_set_id,
    profile_idc,
    constraint_set_flag,
    level_idc,
    chroma_format_idc,
    bit_depth,
    resolution: [width, height],
    vui_parameters,
    // slice header のパースで使う
    separate_colour_plane_flag,
    pic_size_in_map_units: (pic_width_in_mbs_minus1 + 1) * (pic_height_in_map_units_minus1 + 1),
    frame_mbs_only_flag,
    log2_max_frame_num_minus4,
    ... log2_max_pic_order_cnt_lsb_minus4
  };
};

export type SliceGroupMapType = ({
  has_slice_group_map_type: true;
  slice_group_map_type: number;
} | {
  has_slice_group_map_type: false;
}) & ({
  has_slice_group_change_rate_minus1: true;
  slice_group_change_rate_minus1: number;
} | {
  has_slice_group_change_rate_minus1: false;
});

export type PictureParameterSet = {
  pic_parameter_set_id: number;
  seq_parameter_set_id: number;
  entropy_coding_mode_flag: boolean;
  bottom_field_pic_order_in_frame_present_flag: boolean;
  num_ref_idx_l0_default_active_minus1: number,
  num_ref_idx_l1_default_active_minus1: number,
  weighted_pred_flag: boolean,
  weighted_bipred_idc: number,
  deblocking_filter_control_present_flag: boolean;
  redundant_pic_cnt_present_flag: boolean;
} & SliceGroupMapType;

export const read_pic_parameter_set_data = (reader: BitReader): PictureParameterSet => {
  const pic_parameter_set_id = reader.readUEG();
  const seq_parameter_set_id = reader.readUEG();
  const entropy_coding_mode_flag = reader.readBool();
  const bottom_field_pic_order_in_frame_present_flag = reader.readBool();
  const slice_group_map_type = ((): SliceGroupMapType => {
    const num_slice_groups_minus1 = reader.readUEG();
    if (num_slice_groups_minus1 > 0) {
      const slice_group_map_type = reader.readUEG();
      if (slice_group_map_type === 0) {
        for(let iGroup = 0; iGroup <= num_slice_groups_minus1; iGroup++) {
          reader.skipUEG(); // run_length_minus1[iGroup]
        }
      } else if (slice_group_map_type === 1) {
        for(let iGroup = 0; iGroup <= num_slice_groups_minus1; iGroup++) {
          reader.skipUEG(); // top_left[iGroup]
          reader.skipUEG(); // bottom_right[iGroup]
        }
      } else if (3 <= slice_group_map_type && slice_group_map_type <= 5) {
        reader.skipBool(); // slice_group_change_direction_flag
        const slice_group_change_rate_minus1= reader.readUEG();

        return {
          has_slice_group_map_type: true,
          has_slice_group_change_rate_minus1: true,
          slice_group_map_type,
          slice_group_change_rate_minus1,
        } as const;

      } else if (slice_group_map_type === 6) {
        const pic_size_in_map_units_minus1 = reader.readUEG();
        for (let i = 0; i <= pic_size_in_map_units_minus1; i++) {
          const num_slice_groups_bits = sufficient_bits(num_slice_groups_minus1 + 1);
          reader.skipBits(num_slice_groups_bits);
        }
      }
      return {
        has_slice_group_map_type: true,
        has_slice_group_change_rate_minus1: false,
        slice_group_map_type
      } as const;
    } else {
      return {
        has_slice_group_map_type: false,
        has_slice_group_change_rate_minus1: false,
      } as const;
    }
  })();
  const num_ref_idx_l0_default_active_minus1 = reader.readUEG();
  const num_ref_idx_l1_default_active_minus1 = reader.readUEG();
  const weighted_pred_flag = reader.readBool(); // weighted_pred_flag
  const weighted_bipred_idc = reader.readBits(2); // weighted_bipred_idc
  reader.skipSEG(); // pic_init_qp_minus26
  reader.skipSEG(); // pic_init_qs_minus26
  reader.skipSEG(); // chroma_qp_index_offset
  const deblocking_filter_control_present_flag = reader.readBool();
  reader.readBool(); // constrained_intra_pred_flag
  const redundant_pic_cnt_present_flag = reader.readBool();
  // TODO: more_rbsp_data の実装が面倒だし、slice_header を読むのに必要ないので

  return {
    pic_parameter_set_id,
    seq_parameter_set_id,
    entropy_coding_mode_flag,
    bottom_field_pic_order_in_frame_present_flag,
    num_ref_idx_l0_default_active_minus1,
    num_ref_idx_l1_default_active_minus1,
    weighted_pred_flag,
    weighted_bipred_idc,
    ... slice_group_map_type,
    deblocking_filter_control_present_flag,
    redundant_pic_cnt_present_flag,
  };
};

export const write_avc_decoder_configuration_record = (sps_ebsp: Buffer, pps_ebsp: Buffer): Buffer => {
  const sps_details = read_seq_parameter_set_data(strip_nal_unit_header(sps_ebsp));

  const builder = new ByteBuilder();
  builder.writeU8(0x01); // configurationVersion
  builder.writeU8(sps_details.profile_idc); // AVCProfileIndication
  builder.writeU8(sps_details.constraint_set_flag); // profile_compatibility
  builder.writeU8(sps_details.level_idc); // AVCLevelIndication
  builder.writeU8(0b111111_11); // 111111 + lengthSizeMinusOne
  builder.writeU8(0b111_00001); // 111 + numOfSequenceParameterSets
  builder.writeU16BE(sps_ebsp.byteLength); // sequenceParameterSetLength
  builder.write(sps_ebsp); // sequenceParameterSet
  builder.writeU8(0x01); // numOfPictureParameterSets
  builder.writeU16BE(pps_ebsp.byteLength); // PictureParameterSetLength
  builder.write(pps_ebsp); // PictureParameterSet
  if (profile_idc_with_chroma_info_set.has(sps_details.profile_idc)) {
    builder.writeU8(0b111111_00 | (sps_details.chroma_format_idc & 0b11)); // chroma_format
    builder.writeU8(0b11111_000 | ((sps_details.bit_depth.luma - 8) & 0b111)); // bit_depth_luma_minus8
    builder.writeU8(0b11111_000 | ((sps_details.bit_depth.chroma - 8) & 0b111)); // bit_depth_chroma_minus8
    builder.writeU8(0x00); // numOfSequenceParameterSetExt
  }

  return builder.build();
};

export const write_mp4_avc_track_information = (track_id: number, timescale: number, avc_decoder_configuration_record: Buffer): Buffer => {
  const { SequenceParameterSets } = read_avc_decoder_configuration_record(avc_decoder_configuration_record);
  const sps = SequenceParameterSets[0];
  const { resolution, vui_parameters: { source_aspect_ratio } } = read_seq_parameter_set_data(strip_nal_unit_header(sps));

  const presentation = [
    Math.floor(resolution[0] * source_aspect_ratio[0] / source_aspect_ratio[1]),
    resolution[1],
  ];

  return make((vector) => {
    track(track_id, presentation[0], presentation[1], timescale, 'vide', vector, (vector) => {
      avc1(resolution[0], resolution[1], vector, (vector) => {
        avcC(avc_decoder_configuration_record, vector);
      });
    });
  });
};
