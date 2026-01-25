import crypto from 'node:crypto';

import { read_audio_specific_config } from '../../03-tiny-http-ts-server/src/aac.mts';
import { make, esds, track } from '../../06-tiny-http-fmp4-server/src/fmp4.mts';
import { enca, EncryptionFormat, EncryptionScheme, frma, IVType, padIV, patternToFullSample, schi, schm, sinf, tenc, type EncryptionFormatCBCS, type EncryptionFormatCENC, type SubsampleInformation } from './cenc.mts';
import ByteBuilder from '../../01-tiny-rtmp-server/src/byte-builder.mts';

export const write_mp4_aac_track_information = (track_id: number, timescale: number, encryptionFormat: EncryptionFormat, ivType: IVType, keyId: Buffer, audioSpecificConfig: Buffer): Buffer => {
  const { channelConfiguration, samplingFrequency } = read_audio_specific_config(audioSpecificConfig);

  // CBCS の場合、音声は Full-Sample Encryption なので Sub-Sample の Pattern を変更する
  if (encryptionFormat.scheme === EncryptionScheme.CBCS) {
    encryptionFormat = patternToFullSample(encryptionFormat);
  }

  return make((vector) => {
    track(track_id, 0, 0, timescale, 'soun', vector, (vector) => {
      enca(channelConfiguration, 16, samplingFrequency, vector, (vector) => {
        esds(audioSpecificConfig, vector, (vector) => {
          vector.write(Buffer.from([0x06, 0x01, 0x02])); // SyncLayer
        });
        sinf(vector, (vector) => {
          frma('mp4a', vector);
          schm(encryptionFormat.scheme, 0x100, vector);
          schi(vector, (vector) => {
            tenc(encryptionFormat, keyId, ivType, vector);
          });
        });
      });
    });
  });
};

export const encrypt_aac_cenc = (format: EncryptionFormatCENC, key: Buffer, iv: Buffer, data: Buffer): [Buffer, SubsampleInformation[]] => {
  // IV のビット数が少ない場合は 0 埋めして合わせる
  iv = padIV(format, iv);
  // Audio は Full-Sample Encryption
  const cipher = crypto.createCipheriv(format.algorithm, key, iv);
  const encrypted = cipher.update(data);
  // CTR では final は空なので無視
  return [encrypted, []];
};

export const encrypt_aac_cbcs = (format: EncryptionFormatCBCS, key: Buffer, iv: Buffer, data: Buffer): [Buffer, SubsampleInformation[]] => {
  // IV のビット数が少ない場合は 0 埋めして合わせる
  iv = padIV(format, iv);
  // Audio は Full-Sample Encryption
  const cipher = crypto.createCipheriv(format.algorithm, key, iv);
  const builder = new ByteBuilder();
  const encrypt = Math.floor(data.byteLength / format.bytes) * format.bytes;
  builder.write(cipher.update(data.subarray(0, encrypt)));
  builder.write(data.subarray(encrypt));
  // CBC でもあまりがないので final しない
  const encrypted = builder.build();

  return [encrypted, []];
};

export const encrypt_aac = (format: EncryptionFormat, key: Buffer, iv: Buffer, data: Buffer): [Buffer, SubsampleInformation[]] => {
  switch (format.scheme) {
    case EncryptionScheme.CENC: return encrypt_aac_cenc(format, key, iv, data);
    case EncryptionScheme.CBCS: return encrypt_aac_cbcs(format, key, iv, data);
  }
};
