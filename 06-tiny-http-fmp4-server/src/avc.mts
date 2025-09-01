import ByteBuilder from '../../01-tiny-rtmp-server/src/byte-builder.mts';
import { read_avc_decoder_configuration_record } from '../../03-tiny-http-ts-server/src/avc.mts';
import BitReader from '../../03-tiny-http-ts-server/src/bit-reader.mts';
import ByteVector from './byte-vector.mts';
import { avc1, avcC, make, track } from './mp4.mts';

export const ebsp2rbsp = (ebsp: Buffer): Buffer => {
  const rbsp = new ByteVector(ebsp.byteLength);

  rbsp.write(ebsp.subarray(0, 2));
  for (let i = 2; i < ebsp.length - 1; i++) {
    if (ebsp[i - 2] === 0 && ebsp[i - 1] === 0 && ebsp[i - 0] === 3 && 0x00 <= ebsp[i + 1] && ebsp[i + 1] <= 0x03) {
      continue;
    }
    rbsp.writeU8(ebsp[i]);
  }
  rbsp.writeU8(ebsp[ebsp.length - 1]);
  return rbsp.read();
};

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

export type SequenceParameterSet = {
  profile_idc: number;
  constraint_set_flag: number;
  level_idc: number;
  bit_depth: { luma: number; chroma: number; };
  chroma_format_idc: number;
  resolution: [number, number];
  vui_parameters: VUIParameters;
};

export const read_seq_parameter_set_data = (reader: BitReader): SequenceParameterSet => {
  reader.skipBits(8); // skip NALu Header
  const profile_idc = reader.readBits(8);
  const constraint_set_flag = reader.readBits(8);
  const level_idc = reader.readBits(8);
  const seq_parameter_set_id = reader.readUEG();
  const { chroma_format_idc, bit_depth } = (() => {
    if (profile_idc_with_chroma_info_set.has(profile_idc)) {
      const chroma_format_idc = reader.readUEG();
      if (chroma_format_idc === 3) {
        const separate_colour_plane_flag = reader.readBool();
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
      return { chroma_format_idc, bit_depth: { luma: bit_depth_luma_minus8 + 8, chroma: bit_depth_chroma_minus8 + 8 } };
    } else {
      return { chroma_format_idc: 1, bit_depth: { luma: 8, chroma: 8 } };
    }
  })();
  const log2_max_frame_num_minus4 = reader.readUEG();
  const pic_order_cnt_type = reader.readUEG();
  if (pic_order_cnt_type === 0) {
    const log2_max_pic_order_cnt_lsb_minus4 = reader.readUEG();
  } else if (pic_order_cnt_type === 1) {
    const delta_pic_order_always_zero_flag  = reader.readBool();
    const offset_for_non_ref_pic = reader.readSEG();
    const offset_for_top_to_bottom_field = reader.readSEG();
    const num_ref_frames_in_pic_order_cnt_cycle = reader.readUEG();
    for (let i = 0; i < num_ref_frames_in_pic_order_cnt_cycle; i++) {
      const offset_for_ref_frame = reader.readSEG();
    }
  }
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
    profile_idc,
    constraint_set_flag,
    level_idc,
    chroma_format_idc,
    bit_depth,
    resolution: [width, height],
    vui_parameters,
  };
};

export const write_avc_decoder_configuration_record = (sps_ebsp: Buffer, pps_ebsp: Buffer): Buffer => {
  const sps_details = read_seq_parameter_set_data(new BitReader(ebsp2rbsp(sps_ebsp)));

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
  const { resolution, vui_parameters: { source_aspect_ratio } } = read_seq_parameter_set_data(new BitReader(ebsp2rbsp(sps)));

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
