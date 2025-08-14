import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';

export type AVCDecoderConfigurationRecord = {
  configurationVersion: number;
  AVCProfileIndication: number;
  profile_compatibility: number;
  AVCLevelIndication: number;
  lengthSize: number;
  SequenceParameterSets: Buffer[];
  PictureParameterSets: Buffer[];
};

export const read_avc_decoder_configuration_record = (avcDecoderConfigurationRecord: Buffer): AVCDecoderConfigurationRecord => {
  const reader = new ByteReader(avcDecoderConfigurationRecord);

  const configurationVersion = reader.readU8();
  const AVCProfileIndication = reader.readU8();
  const profile_compatibility = reader.readU8();
  const AVCLevelIndication = reader.readU8();
  const lengthSize = (reader.readU8() & 0b00000011) + 1;
  const numOfSequenceParameterSets = reader.readU8() & 0b00011111;
  const SequenceParameterSets = Array.from({ length: numOfSequenceParameterSets }, () => {
    const sequenceParameterSetLength = reader.readU16BE();
    return reader.read(sequenceParameterSetLength);
  });
  const numOfPictureParameterSets = reader.readU8();
  const PictureParameterSets = Array.from({ length: numOfPictureParameterSets }, () => {
    const sequenceParameterSetLength = reader.readU16BE();
    return reader.read(sequenceParameterSetLength);
  });
  return {
    configurationVersion,
    AVCProfileIndication,
    profile_compatibility,
    AVCLevelIndication,
    lengthSize,
    SequenceParameterSets,
    PictureParameterSets,
  };
};

export const write_annexb_avc = (sizedNalus: Buffer, avcDecoderConfigurationRecord: AVCDecoderConfigurationRecord): Buffer => {
  const reader = new ByteReader(sizedNalus);

  const annexb: Buffer[] = [];
  const startcode = Buffer.from([0x00, 0x00, 0x00, 0x01]);
  let hasAUD = false;
  let hasIDR = false;
  while (!reader.isEOF()) {
    const length = reader.readUIntBE(avcDecoderConfigurationRecord.lengthSize);
    const nalu = reader.read(length);
    const naluType = nalu.readUInt8(0) & 0x1F;

    switch (naluType) {
      case 0x09: hasAUD = true; break;
      case 0x05: { // IDR
        if (hasIDR) { break; }
        for (const sps of avcDecoderConfigurationRecord.SequenceParameterSets) {
          annexb.push(startcode, sps);
        }
        for (const pps of avcDecoderConfigurationRecord.PictureParameterSets) {
          annexb.push(startcode, pps);
        }
        hasIDR = true;
        break;
      }
    }
    annexb.push(startcode, nalu);
  }
  const aud = hasAUD ? [] : [startcode, Buffer.from([0x09, 0xF0])];
  return Buffer.concat([... aud, ... annexb]);
};
