import crypto from 'node:crypto';

import { read_audio_specific_config } from '../../03-tiny-http-ts-server/src/aac.mts';
import { make, esds, track } from '../../06-tiny-http-fmp4-server/src/mp4.mts';
import { enca, EncryptionFormat, EncryptionMode, frma, IVType, schi, schm, sinf, tenc, type EncryptionFormatCBCS, type EncryptionFormatCENC, type SubsampleInformation } from './cenc.mts';

export const write_mp4_aac_track_information = (track_id: number, timescale: number, encryptionFormat: EncryptionFormat, ivType: IVType, keyId: Buffer, audioSpecificConfig: Buffer): Buffer => {
  const { channelConfiguration, samplingFrequency } = read_audio_specific_config(audioSpecificConfig);

  return make((vector) => {
    track(track_id, 0, 0, timescale, 'soun', vector, (vector) => {
      enca(channelConfiguration, 16, samplingFrequency, vector, (vector) => {
        esds(audioSpecificConfig, vector, (vector) => {
          vector.write(Buffer.from([0x06, 0x01, 0x02])); // SyncLayer
        });
        sinf(vector, (vector) => {
          frma('mp4a', vector);
          schm('cenc', 0x100, vector);
          schi(vector, (vector) => {
            tenc(encryptionFormat, keyId, ivType, vector);
          });
        });
      });
    });
  });
};

export const encrypt_aac_cenc = (format: EncryptionFormatCENC, key: Buffer, iv: Buffer, data: Buffer): [Buffer, SubsampleInformation[]] => {
  // Audio は Full-Sample Encryption
  const cipher = crypto.createCipheriv(format.algorithm, key, iv);
  const encrypted = cipher.update(data);
  // AES-128-CTR では final は空なので無視
  return [encrypted, []];
};

export const encrypt_aac_cbcs = (format: EncryptionFormatCBCS, key: Buffer, iv: Buffer, data: Buffer): [Buffer, SubsampleInformation[]] => {
  // Audio は Full-Sample Encryption
  // TODO: NEED Implemement Pattern Encrtyption
  const cipher = crypto.createCipheriv(format.algorithm, key, iv);
  const subsamples: SubsampleInformation[] = [];
  for (let i = 0; i < data.byteLength; i += 0xFFFF) {
    subsamples.push([Math.min(0xFFFF, data.byteLength - i), 0]);
  }

  return [data, subsamples];
};

export const encrypt_aac = (format: EncryptionFormat, key: Buffer, iv: Buffer, data: Buffer): [Buffer, SubsampleInformation[]] => {
  switch (format.mode) {
    case EncryptionMode.CENC: return encrypt_aac_cenc(format, key, iv, data);
    case EncryptionMode.CBCS: return encrypt_aac_cbcs(format, key, iv, data)
  }
}
