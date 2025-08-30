import ByteVector from './byte-vector.mts';

export type callback = (vector: ByteVector) => void;

export const make = (cb?: callback): Buffer => {
  const vector = new ByteVector();
  cb?.(vector);
  return vector.read();
}

export const box = (name: string, vector: ByteVector, cb?: callback): void => {
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
    vector.writeU16BE(1); // prefered ratio (upper)
    vector.writeU16BE(0); // prefered ratio (lower)
    vector.writeU16BE(1); // prefered volume
    vector.writeU16BE(0); // predefined
    vector.write(Buffer.alloc(8)); // reserved
    vector.write(Buffer.alloc(36)); // TODO: COMPOSITION_MATRIX
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
    vector.writeU32BE(0); // default_sample_description_index
    vector.writeU32BE(0); // default_sample_duration
    vector.writeU32BE(0); // default_sample_size
    vector.writeU32BE(0x00010001); // default_sample_flags
  });
};
export const trak = (vector: ByteVector, cb?: callback): void => {
  box('trak', vector, cb);
};
export const tkhd = (track_id: number, width: number, height: number, vector: ByteVector, cb?: callback): void => {
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
    vector.write(Buffer.alloc(36)); // TODO: COMPOSITION_MATRIX
    vector.writeU16BE(width); // width (upper)
    vector.writeU16BE(0); // width (lower)
    vector.writeU16BE(height); // height (upper)
    vector.writeU16BE(0); // height (lower)
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
  });
};
export const hdlr = (type: string, name: string, vector: ByteVector, cb?: callback): void => {
  fullbox('hdlr', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0); // pre_defined
    vector.write(Buffer.from(type, 'ascii'));
    vector.write(Buffer.alloc(12)); // reserved
    vector.write(Buffer.from(name, 'ascii'));
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
  });
};
export const smhd = (vector: ByteVector, cb?: callback): void => {
  fullbox('smhd', 0, 0x000000, vector, (vector) => {
    vector.writeU16BE(0); // balance
    vector.writeU16BE(0); // reserved
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
  fullbox('url ', 0, 0x000001, vector); // self contained
}
export const dataInformation = (vector: ByteVector, cb?: callback) => {
  dinf(vector, (vector) => {
    dref(1, vector, (vector) => {
      url(vector);
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

export const avc1 = (width: number, height: number, vector: ByteVector, cb?: callback): void => {
  box('avc1', vector, (vector) => {
    vector.write(Buffer.alloc(6)); // reserved
    vector.writeU16BE(1); // data_reference_index
    vector.writeU16BE(0); // pre_defined
    vector.writeU16BE(0); // reserved
    vector.write(Buffer.alloc(12)); // pre_defined
    vector.writeU16BE(width); // width
    vector.writeU16BE(height); // height
    vector.writeU16BE(0x48); // horizontal_resolution (upper)
    vector.writeU16BE(0); // virtical_resolution (lower)
    vector.writeU16BE(0x48); // virtical_resolution (loewr)
    vector.writeU16BE(0); // virtical_resolution (upper)
    vector.writeU32BE(0); // reserved
    vector.writeU16BE(1); // frame_count
    vector.write(Buffer.alloc(32)); // compressor_name (strlen: 1byte, total: 32byte)
    vector.writeU16BE(0x18); // color_depth
    vector.writeI16BE(-1); // predefined
    cb?.(vector);
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

const moof = (vector: ByteVector, cb?: callback): void => {
  box('moof', vector, cb);
};
const mfhd = (vector: ByteVector, cb?: callback): void => {
  fullbox('mfhd', 0, 0x000000, vector, (vector) => {
    vector.writeU32BE(0);
    cb?.(vector);
  });
};
const traf = (vector: ByteVector, cb?: callback): void => {
  box('traf', vector, cb);
};
const tfhd = (trackId: number, duration: number, vector: ByteVector, cb?: callback): void => {
  fullbox('tfhd', 0, 0x000008, vector, (vector) => {
    vector.writeU32BE(trackId);
    vector.writeU32BE(duration);
    cb?.(vector);
  });
};
const tfdt = (baseMediaDecodeTime: number, vector: ByteVector, cb?: callback): void => {
  fullbox('tfdt', 1, 0x000000, vector, (vector) => {
    vector.writeU32BE((baseMediaDecodeTime / 2 ** 32) % (2 ** 32));
    vector.writeU32BE((baseMediaDecodeTime / 2 **  0) % (2 ** 32));
    cb?.(vector);
  });
};
type Sample = [duration: number, bytes: number, keyframe: boolean, cts: number];
const trun = (samples: Sample[], vector: ByteVector, cb?: callback): void => {
  fullbox('trun', 0, 0x000F01, vector, (vector) => {
    vector.writeU32BE(samples.length);
    vector.writeU32BE(0); // offset
    for (const [duration, bytes, keyframe, cts] of samples) {
      vector.writeU32BE(duration);
      vector.writeU32BE(bytes);
      vector.writeU8(keyframe ? 2 : 1);
      vector.writeU8(((keyframe ? 1 : 0) << 6) | ((keyframe ? 0 : 1) << 0));
      vector.writeU16BE(0);
      vector.writeI32BE(cts);
    }
    cb?.(vector);
  });
};
const mdat = (vector: ByteVector, cb?: callback): void => {
  box('mdat', vector, cb);
};

