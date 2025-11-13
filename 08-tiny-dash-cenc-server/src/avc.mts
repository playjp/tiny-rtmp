import crypto from 'node:crypto';

import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';
import { read_avc_decoder_configuration_record, type AVCDecoderConfigurationRecord } from '../../03-tiny-http-ts-server/src/avc.mts';
import BitReader from '../../03-tiny-http-ts-server/src/bit-reader.mts';
import { ebsp2rbsp, read_seq_parameter_set_data } from '../../06-tiny-http-fmp4-server/src/avc.mts';
import { avcC, make, track } from '../../06-tiny-http-fmp4-server/src/mp4.mts';
import { encv, frma, IVType, schi, schm, sinf, tenc, type SubsampleInformation } from './cenc.mts';
import ByteBuilder from '../../01-tiny-rtmp-server/src/byte-builder.mts';

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

export const encrypt_avc_cenc = (key: Buffer, iv: Buffer, sizedNalus: Buffer, avcDecoderConfigurationRecord: AVCDecoderConfigurationRecord): [Buffer, SubsampleInformation[]] => {
  const cipher = crypto.createCipheriv('aes-128-ctr', key, iv);
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
      builder.write(nalu.subarray(0, 4));

      const update = cipher.update(nalu.subarray(4));
      builder.write(update);

      subsamples.push([naluLengthSize + 4, update.byteLength]);
    } else {
      builder.write(nalu);
      for (let i = 0; i < naluLengthSize + length; i += 0xFFFF) {
        subsamples.push([Math.min(0xFFFF, (naluLengthSize + length) - i), 0]);
      }
    }
  }
  // AES-128-CTR では final は空なので無視

  return [builder.build(), subsamples];
}
