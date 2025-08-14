import BitBuilder from './bit-builder.mts';
import BitReader from './bit-reader.mts';

const samplingFrequencyTable = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050,
  16000, 12000, 11025, 8000, 7350,
] as const;

export type AudioSpecificConfig = {
  audioObjectType: number;
  samplingFrequencyIndex: number;
  samplingFrequency: number;
  channelConfiguration: number;
};

export const read_audio_specific_config = (audioSpecificConfig: Buffer): AudioSpecificConfig => {
  const reader = new BitReader(audioSpecificConfig);

  let audioObjectType = reader.readBits(5);
  if (audioObjectType === 31) { audioObjectType = 32 + reader.readBits(6); }

  const samplingFrequencyIndex = reader.readBits(4);
  const samplingFrequency = samplingFrequencyIndex === 0x0f ? reader.readBits(24) : samplingFrequencyTable[samplingFrequencyIndex];
  const channelConfiguration = reader.readBits(4);

  return {
    audioObjectType,
    samplingFrequencyIndex,
    samplingFrequency,
    channelConfiguration,
  };
};

export const write_adts_aac = (data: Buffer, audioSpecificConfig: AudioSpecificConfig): Buffer => {
  const builder = new BitBuilder();

  // TODO: AAC-LC or Main で samplingFrequencyIndex !== 0x0F なものに絞るべき
  const { audioObjectType, samplingFrequencyIndex, channelConfiguration } = audioSpecificConfig;
  const frameLength = 7 + data.byteLength;

  builder.writeBits(0xFFF, 12); // syncword
  builder.writeBits(1, 1); // mpeg_version
  builder.writeBits(0, 2); // layer
  builder.writeBits(1, 1); // protection_absent (protected = 0)
  builder.writeBits(audioObjectType - 1, 2); // profile
  builder.writeBits(samplingFrequencyIndex, 4); // sampling_frequency_index
  builder.writeBits(0, 1); // private_bit
  builder.writeBits(channelConfiguration, 3); // channel_configuration
  builder.writeBits(0, 1); // original/copy
  builder.writeBits(0, 1); // home
  builder.writeBits(0, 1); // copyright_identification_bit
  builder.writeBits(0, 1); // copyright_identification_start
  builder.writeBits(frameLength, 13); // frame_length
  builder.writeBits(0x7FF, 11); // adts_buffer_fullness
  builder.writeBits(0, 2); // number_of_raw_data_blocks_in_frame

  return Buffer.concat([builder.build(), data]);
};
