import ByteVector from './byte-vector.mts';


const fixed_point_U16BE = (integer: number, decimal: number, vector: ByteVector): void => {
  vector.writeU16BE(integer);
  vector.writeU16BE(decimal);
};

const unit_composition_matrix = (() => {
  const vector = new ByteVector();
  fixed_point_U16BE(1, 0, vector); // [0, 0] 16.16 固定小数点
  fixed_point_U16BE(0, 0, vector); // [0, 1] 16.16 固定小数点
  fixed_point_U16BE(0, 0, vector); // [0, 2] 16.16 固定小数点
  fixed_point_U16BE(0, 0, vector); // [1, 0] 16.16 固定小数点
  fixed_point_U16BE(1, 0, vector); // [1, 1] 16.16 固定小数点
  fixed_point_U16BE(0, 0, vector); // [1, 2] 16.16 固定小数点
  vector.writeU32BE(0x00000000);   // [2, 0] 2.30 固定小数点
  vector.writeU32BE(0x00000000);   // [2, 1] 2.30 固定小数点
  vector.writeU32BE(0x40000000);   // [2, 2] 2.30 固定小数点
  // finaize
  return vector.read();
})();

export type callback = (vector: ByteVector) => void;

export const make = (cb?: callback): Buffer => {
  const vector = new ByteVector();
  cb?.(vector);
  return vector.read();
};

export const box = (name: string, vector: ByteVector, cb?: callback): void => {
  // MEMO: fmp4 は large box を使うことはないという仮定をしている
  const begin = vector.byteLength();
  vector.writeU32BE(0);
  vector.write(Buffer.from(name, 'ascii'));
  cb?.(vector);
  const end = vector.byteLength();
  vector.writeU32BE(end - begin, begin);
};

export const fullbox = (name: string, version: number, flags: number, vector: ByteVector, cb?: callback): void => {
  box(name, vector, (vector) => {
    vector.writeU8(version);
    vector.writeU24BE(flags);
    cb?.(vector);
  });
};

export const ftyp = (vector: ByteVector, cb?: callback): void => {
  return box('ftyp', vector, (vector) => {
    vector.write(Buffer.from('isom', 'ascii'));
    vector.writeU32BE(1);
    vector.write(Buffer.from('isom', 'ascii'));
    vector.write(Buffer.from('avc1', 'ascii'));
    cb?.(vector);
  });
};
export const moov = (vector: ByteVector, cb?: callback): void => {
  box('moov', vector, cb);
};
export const mvhd = (timescale: number, vector: ByteVector, cb?: callback): void => {
  fullbox('mvhd', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0); // creation_time
    vector.writeU32BE(0); // modification_time
    vector.writeU32BE(timescale); // timescale
    vector.writeU32BE(0); // duration
    fixed_point_U16BE(1, 0, vector); // prefered ratio
    vector.writeU16BE(1); // prefered volume
    vector.writeU16BE(0); // predefined
    vector.write(Buffer.alloc(8)); // reserved
    vector.write(unit_composition_matrix); // composition_matrix
    vector.write(Buffer.alloc(24)); // reserved
    vector.writeI32BE(-1); // next_track_id
  });
};
export const mvex = (vector: ByteVector, cb?: callback): void => {
  box('mvex', vector, cb);
};
export const trex = (track_id: number, vector: ByteVector, cb?: callback): void => {
  fullbox('trex', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(track_id); // track_id
    vector.writeU32BE(1); // default_sample_description_index
    vector.writeU32BE(0); // default_sample_duration
    vector.writeU32BE(0); // default_sample_size
    vector.writeU32BE(0x00010001); // default_sample_flags
  });
};
export const trak = (vector: ByteVector, cb?: callback): void => {
  box('trak', vector, cb);
};
export const tkhd = (track_id: number, width: number, height: number, vector: ByteVector, cb?: callback): void => {
  // MEMO: 0x000001 => track_enabled
  // MEMO: 0x000002 => track_in_movie
  // MEMO: 0x000004 => track_in_preview
  fullbox('tkhd', 0, 0x000007, vector, (vector) => {
    vector.writeU32BE(0); // creation_time
    vector.writeU32BE(0); // modification_time
    vector.writeU32BE(track_id); // track_id
    vector.writeU32BE(0); // reserved
    vector.writeU32BE(0); // duration
    vector.write(Buffer.alloc(8)); // reserved
    vector.writeU16BE(0); // layer
    vector.writeU16BE(0); // alternate_group
    vector.writeU16BE(0); // volume
    vector.writeU16BE(0); // reserved
    vector.write(unit_composition_matrix); // composition_matrix
    fixed_point_U16BE(width, 0, vector); // width
    fixed_point_U16BE(height, 0, vector); // height
    cb?.(vector);
  });
};
export const mdia = (vector: ByteVector, cb?: callback): void => {
  box('mdia', vector, cb);
};
export const mdhd = (timescale: number, vector: ByteVector, cb?: callback): void => {
  fullbox('mdhd', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0); // creation_time
    vector.writeU32BE(0); // modification_time
    vector.writeU32BE(timescale); // timescale
    vector.writeU32BE(0); // duration
    vector.writeU16BE(0x55C4); // language: und
    vector.writeU16BE(0); // pre_defined = 0
    cb?.(vector);
  });
};
export const hdlr = (type: string, name: string, vector: ByteVector, cb?: callback): void => {
  fullbox('hdlr', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0); // pre_defined
    vector.write(Buffer.from(type, 'ascii'));
    vector.write(Buffer.alloc(12)); // reserved
    vector.write(Buffer.from(name, 'ascii'));
    cb?.(vector);
  });
};
export const minf = (vector: ByteVector, cb?: callback): void => {
  box('minf', vector, cb);
};
export const nmhd = (vector: ByteVector, cb?: callback): void => {
  fullbox('nmhd', 0, 0x000000, vector, cb);
};
export const vmhd = (vector: ByteVector, cb?: callback): void => {
  fullbox('vmhd', 0, 0x000000, vector, (vector) => {
    vector.writeU16BE(0); // graphicsmode
    vector.write(Buffer.alloc(6)); // opcolor
    cb?.(vector);
  });
};
export const smhd = (vector: ByteVector, cb?: callback): void => {
  fullbox('smhd', 0, 0x000000, vector, (vector) => {
    vector.writeU16BE(0); // balance
    vector.writeU16BE(0); // reserved
    cb?.(vector);
  });
};
export const dinf = (vector: ByteVector, cb?: callback): void => {
  box('dinf', vector, cb);
};
export const dref = (entries: number, vector: ByteVector, cb?: callback): void => {
  fullbox('dref', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(entries); // entries
    cb?.(vector);
  });
};
export const url = (vector: ByteVector, cb?: callback): void => {
  // MEMO: 0x000001 => media in same file
  fullbox('url ', 0, 0x000001, vector, cb); // self contained
};
export const dataInformation = (vector: ByteVector, cb?: callback) => {
  dinf(vector, (vector) => {
    dref(1, vector, (vector) => {
      url(vector, cb);
    });
  });
};

export const stbl = (vector: ByteVector, cb?: callback): void => {
  box('stbl', vector, cb);
};
export const stts = (vector: ByteVector, cb?: callback): void => {
  fullbox('stts', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0);
    cb?.(vector);
  });
};
export const stsc = (vector: ByteVector, cb?: callback): void => {
  fullbox('stsc', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0);
    cb?.(vector);
  });
};
export const stsz = (vector: ByteVector, cb?: callback): void => {
  fullbox('stsz', 0, 0x000000, vector, (vector) => {
    vector.write(Buffer.alloc(8));
    cb?.(vector);
  });
};
export const stco = (vector: ByteVector, cb?: callback): void => {
  fullbox('stco', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0);
    cb?.(vector);
  });
};
export const stsd = (vector: ByteVector, cb?: callback): void => {
  fullbox('stsd', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(1);
    cb?.(vector);
  });
};
export const sampleTable = (vector: ByteVector, cb?: callback): void => {
  stbl(vector, (vector) => {
    stsd(vector, cb);
    stts(vector);
    stsc(vector);
    stsz(vector);
    stco(vector);
  });
};

export const sampleEntry = (vector: ByteVector, cb?: callback): void => {
  vector.write(Buffer.alloc(6)); // reserved
  vector.writeU16BE(1); // data_reference_index
  cb?.(vector);
};

export const srat = (sample_rate: number, vector: ByteVector, cb?: callback): void => {
  fullbox('srat', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(sample_rate);
    cb?.(vector);
  });
};

export const audioSampleEntry = (channel_count: number, sample_size: number, sample_rate: number, vector: ByteVector, cb?: callback): void => {
  sampleEntry(vector);
  vector.write(Buffer.alloc(8)); // reserved
  vector.writeU16BE(channel_count); // 0: unknown, 1: mono, 2: stereo
  vector.writeU16BE(sample_size); // bit数 (8, 16, 24, ...)
  vector.writeU32BE(0); // reserved
  fixed_point_U16BE(sample_rate, 0, vector); // sample_rate
  if (sample_rate >= 2 ** 16) { // 16bit で収まらない sample_rate は srat box で記載
    srat(sample_rate, vector);
  }
  // MEMO: MSE 実装だと chnl box が基本ないけど、いる場合はあるの?
  // コーデック情報がない PCM (Safari 18 は ipcm サポートあり) ではマルチチャンネル時にいりそうな気が...
  cb?.(vector);
};

export const mp4a = (channel_count: number, sample_size: number, sample_rate: number, vector: ByteVector, cb?: callback): void => {
  box('mp4a', vector, (vector) => {
    audioSampleEntry(channel_count, sample_size, sample_rate, vector, cb);
  });
};

export const esds = (audioSpecificConfig: Buffer, vector: ByteVector, cb?: callback): void => {
  fullbox('esds', 0, 0, vector, (vector) => {
    vector.writeU8(0x03); // descriptor_type
    vector.writeU8(0x17 + audioSpecificConfig.byteLength); // descriptor_length
    vector.writeU16BE(0x01); // es_id
    vector.writeU8(0); // stream_priority
    vector.writeU8(0x04); // descriptor_type
    vector.writeU8(0x0F + audioSpecificConfig.byteLength); // descriptor_length
    vector.writeU8(0x40); // codec: mp4a
    vector.writeU8(0x15); // stream_type: audio
    vector.writeU24BE(0); // buffer_size
    vector.writeU32BE(0); // max_bit_rate
    vector.writeU32BE(0); // avg_bit_rate
    vector.writeU8(0x05); // descriptor_type
    vector.writeU8(audioSpecificConfig.byteLength); // descriptor_length
    vector.write(audioSpecificConfig);
    cb?.(vector);
  });
};

export const visualSampleEntry = (width: number, height: number, vector: ByteVector, cb?: callback): void => {
  sampleEntry(vector);
  vector.writeU16BE(0); // pre_defined
  vector.writeU16BE(0); // reserved
  vector.write(Buffer.alloc(12)); // pre_defined
  vector.writeU16BE(width); // width
  vector.writeU16BE(height); // height
  fixed_point_U16BE(0x48, 0, vector); // horizontal_resolution
  fixed_point_U16BE(0x48, 0, vector); // vertical_resolution
  vector.writeU32BE(0); // reserved
  vector.writeU16BE(1); // frame_count
  vector.write(Buffer.alloc(32)); // compressor_name (strlen: 1byte, total: 32byte)
  vector.writeU16BE(0x18); // color_depth
  vector.writeI16BE(-1); // predefined
  cb?.(vector);
};

export const avc1 = (width: number, height: number, vector: ByteVector, cb?: callback): void => {
  box('avc1', vector, (vector) => {
    visualSampleEntry(width, height, vector, cb);
  });
};
export const avcC = (avcDecoderConfigurationRecord: Buffer, vector: ByteVector, cb?: callback): void => {
  box('avcC', vector, (vector) => {
    vector.write(avcDecoderConfigurationRecord);
    cb?.(vector);
  });
};

export const track = (track_id: number, width: number, height: number, timescale: number, type: string, vector: ByteVector, cb?: callback): void => {
  trak(vector, (vector) => {
    tkhd(track_id, width, height, vector);
    mdia(vector, (vector) => {
      mdhd(timescale, vector);
      hdlr(type, 'PLAY, Inc', vector);
      minf(vector, (vector) => {
        switch (type) {
          case 'vide': vmhd(vector); break;
          case 'soun': smhd(vector); break;
          default: nmhd(vector); break;
        }
        dataInformation(vector);
        sampleTable(vector, cb);
      });
    });
  });
};

export const initialize = (timescale: number, track_ids: number[], vector: ByteVector, cb?: callback): void => {
  ftyp(vector);
  moov(vector, () => {
    mvhd(timescale, vector);
    mvex(vector, (vector) => {
      for (const track_id of track_ids) {
        trex(track_id, vector);
      }
    });
    cb?.(vector);
  });
};

export const moof = (vector: ByteVector, cb?: callback): void => {
  box('moof', vector, cb);
};
export const mfhd = (vector: ByteVector, cb?: callback): void => {
  fullbox('mfhd', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0); // sequence_number
    cb?.(vector);
  });
};
export const traf = (vector: ByteVector, cb?: callback): void => {
  box('traf', vector, cb);
};
export const tfhd = (trackId: number, vector: ByteVector, cb?: callback): void => {
  // MEMO: 0x000001 => base-data-offset-present
  // MEMO: 0x000002 => sample-description_index-present
  // MEMO: 0x000008 => default-sample-duration-present
  // MEMO: 0x000010 => default-sample-size-present
  // MEMO: 0x000020 => default-sample-flags-present
  // MEMO: 0x010000 => duration-is-empty
  // MEMO: 0x020000 => default-base-is-moof
  fullbox('tfhd', 0, 0x020000, vector, (vector) => {
    vector.writeU32BE(trackId); // track_id
    cb?.(vector);
  });
};
export const tfdt = (baseMediaDecodeTime: number, vector: ByteVector, cb?: callback): void => {
  fullbox('tfdt', 1, 0x000000, vector, (vector) => {
    // Number.MAX_SAFE_INTEGER (2^53 - 1) を超得ることはない、という仮定のもとで number で表現している
    vector.writeU32BE(Math.floor(baseMediaDecodeTime / 2 ** 32) % (2 ** 32));
    vector.writeU32BE(Math.floor(baseMediaDecodeTime / 2 **  0) % (2 ** 32));
    cb?.(vector);
  });
};
export type TrunSample = {
  duration: number;
  bytes: number;
  keyframe: boolean;
  cto: number;
};
export const trun = (offset: number, samples: TrunSample[], vector: ByteVector, cb?: callback): void => {
  // MEMO: 0x000001 => data-offset-present
  // MEMO: 0x000100 => sample-duration-present
  // MEMO: 0x000200 => sample-size-present
  // MEMO: 0x000400 => sample-flags-present
  // MEMO: 0x000800 => sample-composition-time-offset-present
  fullbox('trun', 1, 0x000F01, vector, (vector) => {
    vector.writeU32BE(samples.length); // sample_count
    vector.writeU32BE(offset); // offset (指定したくないけど、互換性のために)
    for (const { duration, bytes, keyframe, cto } of samples) {
      vector.writeU32BE(duration);
      vector.writeU32BE(bytes);
      // keyframe: 0x000000_10(ほかに依存なし)_01(依存される)_00(冗長か不明)_00(キーフレーム)
      // non-keyframe: 0b00000_01(ほかに依存する)_00(依存されるか不明)_00(冗長か不明)_01(非キーフレーム)
      vector.writeU8(keyframe ? 2 : 1);
      vector.writeU8(((keyframe ? 1 : 0) << 6) | ((keyframe ? 0 : 1) << 0));
      vector.writeU16BE(0); // これもフラグの一部
      // cto (composition time offset) は MPEG-TS でいう pts - dts のこと
      // version 1 では signed で、それを使いたいので signed にしている
      vector.writeI32BE(cto);
    }
    cb?.(vector);
  });
};
const mdat = (data: Buffer, vector: ByteVector, cb?: callback): void => {
  box('mdat', vector, (vector) => {
    vector.write(data);
    cb?.(vector);
  });
};
export type FragmentInformation = {
  track_id: number;
  dts: number;
  cto: number;
  duration: number;
  keyframe: boolean;
};
export const fragment = (information: FragmentInformation, data: Buffer, vector: ByteVector, cb?: callback): void => {
  let trun_offset = null;
  const begin = vector.byteLength();
  moof(vector, (vector) => {
    mfhd(vector);
    traf(vector, (vector) => {
      tfhd(information.track_id, vector);
      tfdt(information.dts, vector, (vector) => {
        trun_offset = vector.byteLength();
      });
      trun(0 /* ダミー */, [{
        duration: information.duration,
        bytes: data.byteLength,
        keyframe: information.keyframe,
        cto: information.cto,
      }], vector);
    });
  });
  const end = vector.byteLength();
  mdat(data, vector, cb);
  // ダミーを正しい値にする
  const access_index = 4 /* size */ + 4 /* fourcc */ + 4 /* version + flags */ + 4;
  vector.writeU32BE(end - begin + 8 /* mdat header */, trun_offset! + access_index);
};
