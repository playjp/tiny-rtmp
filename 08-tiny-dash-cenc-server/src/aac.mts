import { read_audio_specific_config } from '../../03-tiny-http-ts-server/src/aac.mts';
import { make, esds, mp4a, track } from '../../06-tiny-http-fmp4-server/src/mp4.mts';
import { enca, frma, IVType, schi, schm, sinf, tenc } from './cenc.mts';

export const write_mp4_aac_track_information = (track_id: number, timescale: number, ivType: IVType, keyId: Buffer, audioSpecificConfig: Buffer): Buffer => {
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
            tenc(null, keyId, ivType, vector);
          });
        });
      });
    });
  });
};
