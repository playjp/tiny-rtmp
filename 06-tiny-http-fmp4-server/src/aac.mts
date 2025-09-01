import { read_audio_specific_config } from '../../03-tiny-http-ts-server/src/aac.mts';
import { make, esds, mp4a, track } from './mp4.mts';

export const write_mp4_aac_track_information = (track_id: number, timescale: number, audioSpecificConfig: Buffer): Buffer => {
  const { channelConfiguration, samplingFrequency } = read_audio_specific_config(audioSpecificConfig);

  return make((vector) => {
    track(track_id, 0, 0, timescale, 'soun', vector, (vector) => {
      mp4a(channelConfiguration, 16, samplingFrequency, vector, (vector) => {
        esds(audioSpecificConfig, vector);
        vector.write(Buffer.from([0x06, 0x01, 0x02])); // SyncLayer
      });
    });
  });
};
