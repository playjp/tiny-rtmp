import crypto from 'node:crypto';

import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';
import { read_avc_decoder_configuration_record, type AVCDecoderConfigurationRecord } from '../../03-tiny-http-ts-server/src/avc.mts';
import BitReader from '../../03-tiny-http-ts-server/src/bit-reader.mts';
import { ebsp2rbsp, read_seq_parameter_set_data } from '../../06-tiny-http-fmp4-server/src/avc.mts';
import { avcC, make, track } from '../../06-tiny-http-fmp4-server/src/mp4.mts';
import { EncryptionFormat, EncryptionScheme, encv, frma, IVType, padIV, schi, schm, sinf, tenc, type EncryptionFormatCBCS, type EncryptionFormatCENC, type SubsampleInformation } from './cenc.mts';
import ByteBuilder from '../../01-tiny-rtmp-server/src/byte-builder.mts';

export const write_mp4_avc_track_information = (track_id: number, timescale: number, encryptionFormat: EncryptionFormat, ivType: IVType, keyId: Buffer, avc_decoder_configuration_record: Buffer): Buffer => {
  const { SequenceParameterSets } = read_avc_decoder_configuration_record(avc_decoder_configuration_record);
  const sps = SequenceParameterSets[0];
  const { resolution, vui_parameters: { source_aspect_ratio } } = read_seq_parameter_set_data(new BitReader(ebsp2rbsp(sps)));

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
  const reader = new ByteReader(sizedNalus);

  const subsamples: SubsampleInformation[] = [];
  while (!reader.isEOF()) {
    const naluLengthSize = avcDecoderConfigurationRecord.lengthSize;
    const length = reader.readUIntBE(naluLengthSize);
    const nalu = reader.read(length);
    const naluType = nalu.readUInt8(0) & 0x1F;
    const isVCL = 1 <= naluType && naluType <= 5;

    builder.writeUIntBE(length, avcDecoderConfigurationRecord.lengthSize);
    if (isVCL) {
      const clearBytes = Math.min(nalu.byteLength, 4);
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
  const reader = new ByteReader(sizedNalus);

  const subsamples: SubsampleInformation[] = [];
  while (!reader.isEOF()) {
    const cipher = crypto.createCipheriv(format.algorithm, key, iv);
    const naluLengthSize = avcDecoderConfigurationRecord.lengthSize;
    const length = reader.readUIntBE(naluLengthSize);
    const nalu = reader.read(length);
    const naluType = nalu.readUInt8(0) & 0x1F;
    const isVCL = 1 <= naluType && naluType <= 5;

    builder.writeUIntBE(length, avcDecoderConfigurationRecord.lengthSize);
    if (isVCL) {
      const clearBytes = Math.min(nalu.byteLength, 4);
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
    case EncryptionScheme.CBCS: return encrypt_avc_cbcs(format, key, iv, sizedNalus, avcDecoderConfigurationRecord)
  }
}
