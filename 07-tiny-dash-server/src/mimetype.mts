import type { AudioSpecificConfig } from '../../03-tiny-http-ts-server/src/aac.mts';
import type { AVCDecoderConfigurationRecord } from '../../03-tiny-http-ts-server/src/avc.mts';

export const avcMimeTypeCodec = (avcDecoderConfigurationRecord: AVCDecoderConfigurationRecord): string => {
  const profile = avcDecoderConfigurationRecord.AVCProfileIndication.toString(16).toUpperCase().padStart(2, '0');
  const compatibility = avcDecoderConfigurationRecord.profile_compatibility.toString(16).toUpperCase().padStart(2, '0');
  const level = avcDecoderConfigurationRecord.AVCLevelIndication.toString(16).toUpperCase().padStart(2, '0');

  return `avc1.${profile}${compatibility}${level}`;
};

export const aacMimeTypeCodec = (audio_specific_config: AudioSpecificConfig): string => {
  const object_type = audio_specific_config.audioObjectType;

  return `mp4a.40.${object_type}`;
};
