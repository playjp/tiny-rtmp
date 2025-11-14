import type ByteVector from '../../06-tiny-http-fmp4-server/src/byte-vector.mts';
import { audioSampleEntry, box, fullbox, mdat, mfhd, moof, tfdt, tfhd, traf, trun, visualSampleEntry, type callback, type FragmentInformation } from '../../06-tiny-http-fmp4-server/src/mp4.mts';

export const pssh = (system_id: Buffer, kids: Buffer[], data: Buffer, vector: ByteVector, cb?: callback): void => {
  fullbox('pssh', 1, 0x000000, vector, (vector) => {
    vector.write(system_id);
    vector.writeU32BE(kids.length);
    for (const kid of kids) {
      vector.write(kid);
    }
    vector.writeU32BE(data.byteLength);
    vector.write(data);
    cb?.(vector);
  });
};

export const sinf = (vector: ByteVector, cb?: callback): void => {
  box('sinf', vector, (vector) => {
    cb?.(vector);
  });
};

export const frma = (original_format: string, vector: ByteVector, cb?: callback): void => {
  box('frma', vector, (vector) => {
    vector.write(Buffer.from(original_format, 'ascii'));
    cb?.(vector);
  });
};

export const schm = (scheme_type: string, version: number, vector: ByteVector, cb?: callback): void => {
  fullbox('schm', 0, 0x000000, vector, (vector) => {
    vector.write(Buffer.from(scheme_type, 'ascii'));
    vector.writeU32BE(version);
    cb?.(vector);
  });
};

export const schi = (vector: ByteVector, cb?: callback): void => {
  box('schi', vector, (vector) => {
    cb?.(vector);
  });
};

export const IVType = {
  CONSTANT: 'constant',
  PER_SAMPLE: 'per-sample',
} as const;

export type IVType = {
  type: typeof IVType.CONSTANT;
  constant_iv: Buffer;
} | {
  type: typeof IVType.PER_SAMPLE;
  per_sample_iv_size: number;
};

export const EncryptionMode = {
  CENC: 'cenc',
  CBCS: 'cbcs',
} as const;

export type EncryptionFormat = ({
  name: 'cenc-128bit';
  mode: typeof EncryptionMode.CENC;
  algorithm: 'aes-128-ctr';
  bytes: 16;
} | {
  name: 'cbcs-128bit';
  mode: typeof EncryptionMode.CBCS;
  algorithm: 'aes-128-cbc';
  bytes: 16;
  patttern: [crypto: number, clear: number];
});
export type EncryptionFormatCENC = EncryptionFormat & { mode: typeof EncryptionMode.CENC; };
export type EncryptionFormatCBCS = EncryptionFormat & { mode: typeof EncryptionMode.CBCS; };

export const patternToFullSample = (format: EncryptionFormatCBCS): EncryptionFormatCBCS => {
  return {
    ... format,
    // 音声などの cbcs で Full-Sample をする場合
    // [0, 0] (PlayReady) でも [1, 0] (shaka-packger) でも良い
    patttern: [1, 0]
  };
};

export const EncryptionFormat = {
  from(mode: (typeof EncryptionMode)[keyof typeof EncryptionMode]): EncryptionFormat {
    switch (mode) {
      case EncryptionMode.CENC: return {
        name: 'cenc-128bit',
        mode: EncryptionMode.CENC,
        algorithm: 'aes-128-ctr',
        bytes: 16,
      };
      case EncryptionMode.CBCS: return {
        name: 'cbcs-128bit',
        mode: EncryptionMode.CBCS,
        algorithm: 'aes-128-cbc',
        bytes: 16,
        patttern: [1, 9], // 大体 1:9 で FairPlay とかもそうする
      };
    }
  }
}

export const tenc = (format: EncryptionFormat, keyId: Buffer, ivType: IVType, vector: ByteVector, cb?: callback): void => {
  const pattern = format.mode === EncryptionMode.CBCS ? format.patttern : null;

  fullbox('tenc', pattern == null ? 0 : 1, 0x000000, vector, (vector) => {
    vector.writeU8(0); // reserved
    if (pattern == null) {
      vector.writeU8(0); // reserved
    } else {
      vector.writeU8(((pattern[0] & 0x0F) << 4) | ((pattern[1] & 0x0F) << 0));
    }
    vector.writeU8(1); // isProtected
    vector.writeU8(ivType.type === IVType.CONSTANT ? 0 : ivType.per_sample_iv_size); // Per_Sample_IV_Size;
    vector.write(keyId); // default_KID
    if (ivType.type === IVType.CONSTANT) {
      vector.writeU8(ivType.constant_iv.byteLength);
      vector.write(ivType.constant_iv);
    }
    cb?.(vector);
  });
};

export const encv = (width: number, height: number, vector: ByteVector, cb?: callback): void => {
  box('encv', vector, (vector) => {
    visualSampleEntry(width, height, vector, cb);
  });
};

export const enca = (channel_count: number, sample_size: number, sample_rate: number, vector: ByteVector, cb?: callback): void => {
  box('enca', vector, (vector) => {
    audioSampleEntry(channel_count, sample_size, sample_rate, vector, cb);
  });
};

export type SubsampleInformation = [
  clearBytes: number,
  protectedBytes: number,
];
export type SampleInformation = {
  iv: Buffer;
  subsamples: SubsampleInformation[];
};

export const saiz = (samples: SampleInformation[], ivType: (typeof IVType)[keyof typeof IVType],  vector: ByteVector, cb?: callback): void => {
  const use_subsample = samples.some((sample) => sample.subsamples.length > 0);
  // flags が 1 の場合 aux_info_type と aux_info_type_parameter が入る
  fullbox('saiz', 0, 0x000000, vector, (vector) => {
    vector.writeU8(0);
    vector.writeU32BE(samples.length);
    for (const { iv, subsamples } of samples) {
      vector.writeU8((ivType === IVType.PER_SAMPLE ? iv.byteLength : 0) + (!use_subsample ? 0 : 2 + subsamples.length * 6));
    }
    cb?.(vector);
  });
};

export const saio = (offsets: number[], vector: ByteVector, cb?: callback): void => {
  // flags が 1 の場合 aux_info_type と aux_info_type_parameter が入る
  // version が 1 の場合は offset が 64bit だが、box 構築の時点でそういうのは考慮しないのでいい
  fullbox('saio', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(offsets.length);
    for (const offset of offsets) {
      vector.writeU32BE(offset);
    }
    cb?.(vector);
  });
};

export const senc = (samples: SampleInformation[], ivType: (typeof IVType)[keyof typeof IVType], vector: ByteVector, cb?: callback): void => {
  const use_iv = ivType === IVType.PER_SAMPLE;
  const use_subsample = samples.some((sample) => sample.subsamples.length > 0);
  const flags = (use_subsample ? 0x000002 : 0);

  fullbox('senc', 0, flags, vector, (vector) => {
    vector.writeU32BE(samples.length);
    for (const { iv, subsamples } of samples) {
      if (use_iv) {
        vector.write(iv);
      }

      if (use_subsample) {
        vector.writeU16BE(subsamples.length);
        for (const [clearBytes, protectedBytes] of subsamples) {
          vector.writeU16BE(clearBytes);
          vector.writeU32BE(protectedBytes);
        }
      }
    }
    cb?.(vector);
  });
};

export const fragment = (fragment: FragmentInformation, encryption: SampleInformation, ivType: (typeof IVType)[keyof typeof IVType], data: Buffer, vector: ByteVector, cb?: callback): void => {
  let trun_offset = null;

  const moof_begin = vector.byteLength();
  moof(vector, (vector) => {
    mfhd(vector);
    traf(vector, (vector) => {
      tfhd(fragment.track_id, vector);
      tfdt(fragment.dts, vector, (vector) => {
        trun_offset = vector.byteLength();
      });
      trun(0 /* ダミー */, [{
        duration: fragment.duration,
        bytes: data.byteLength,
        keyframe: fragment.keyframe,
        cto: fragment.cto,
      }], vector);
      saiz([encryption], ivType, vector);
      const saio_begin = vector.byteLength();
      saio([0] /* ダミー */, vector);
      const senc_begin = vector.byteLength();
      senc([encryption], ivType, vector);
      // saio のダミーを正しい値にする
      const senc_offset = 4 /* size */ + 4 /* fourcc */ + 4 /* version + flags */ + 4;
      const saio_access_index = 4 /* size */ + 4 /* fourcc */ + 4 /* version + flags */ + 4;
      vector.writeU32BE(senc_begin + senc_offset - moof_begin, saio_begin + saio_access_index);
    });
  });
  const moof_end = vector.byteLength();
  mdat(data, vector, cb);
  // trun のダミーを正しい値にする
  const trun_access_index = 4 /* size */ + 4 /* fourcc */ + 4 /* version + flags */ + 4;
  vector.writeU32BE(moof_end - moof_begin + 8 /* mdat header */, trun_offset! + trun_access_index);
};
