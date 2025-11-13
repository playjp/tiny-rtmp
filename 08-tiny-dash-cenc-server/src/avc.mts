import { read_avc_decoder_configuration_record } from '../../03-tiny-http-ts-server/src/avc.mts';
import BitReader from '../../03-tiny-http-ts-server/src/bit-reader.mts';
import { ebsp2rbsp, read_seq_parameter_set_data } from '../../06-tiny-http-fmp4-server/src/avc.mts';
import { avcC, make, track } from '../../06-tiny-http-fmp4-server/src/mp4.mts';
import { encv, frma, IVType, schi, schm, sinf, tenc } from './cenc.mts';

export const write_mp4_avc_track_information = (track_id: number, timescale: number, ivType: IVType, keyId: Buffer, avc_decoder_configuration_record: Buffer): Buffer => {
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
          schm('cenc', 0x10000, vector);
          schi(vector, (vector) => {
            tenc(null, keyId, ivType, vector);
          });
        });
      });
    });
  });
};
