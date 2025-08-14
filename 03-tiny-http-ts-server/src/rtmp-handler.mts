import { MessageType } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';
import read_amf0 from '../../01-tiny-rtmp-server/src/amf0-reader.mts';

type VideoMessage = Message & {
  message_type_id: (typeof MessageType.Video);
};
type AudioMessage = Message & {
  message_type_id: (typeof MessageType.Audio);
};
type AMF0DataMessage = Message & {
  message_type_id: (typeof MessageType.DataAMF0);
};

export const VideoCodecType = {
  AVC: 7,
} as const;

export const AudioCodecType = {
  AAC: 10,
} as const;

export const FrameType = {
  KEY_FRAME: 1,
  INTER_FRAME: 2,
  DISPOSABLE_INTER_FRAME: 3,
  GENERATED_KEY_FRAME: 4,
  VIDEO_INFO_OR_COMMAND: 5,
} as const;

export type AVCData = {
  codec: 'AVC',
} & ({
  packetType: 0,
  avcDecoderConfigurationRecord: Buffer;
} | {
  packetType: 1,
  compositionTimeOffset: number;
  data: Buffer;
});
export type VideoData = AVCData & {
  timestamp: number;
  type: number;
  kind: 'Video';
};

export type AACData = {
  codec: 'AAC',
} & ({
  packetType: 0;
  audioSpecificConfig: Buffer;
} | {
  packetType: 1;
  data: Buffer;
});
export type AudioData = AACData & {
  timestamp: number;
  kind: 'Audio';
};

export type ActionScriptData = {
  timestamp: number;
  kind: 'Data',
  values: any[];
};

const handle_avc = (reader: ByteReader): AVCData | null => {
  const packetType = reader.readU8();
  const compositionTimeOffset = reader.readI24BE();

  switch (packetType) {
    case 0: return {
      codec: 'AVC',
      packetType,
      avcDecoderConfigurationRecord: reader.read(),
    };
    case 1: return {
      codec: 'AVC',
      packetType,
      compositionTimeOffset,
      data: reader.read(),
    };
    default:
      return null;
  }
};

export const handle_video = (message: VideoMessage): VideoData | null => {
  const reader = new ByteReader(message.data);

  const meta = reader.readU8();
  const type = (meta & 0xF0) >> 4;
  const codec = (meta & 0x0F) >> 0;

  switch (codec) {
    case VideoCodecType.AVC: {
      const avc = handle_avc(reader);
      if (avc == null) { return null; }
      return { kind: 'Video', type, timestamp: message.timestamp, ... avc };
    }
    default:
      return null;
  }
};

const handle_aac = (reader: ByteReader): AACData | null => {
  const packetType = reader.readU8();
  switch (packetType) {
    case 0: return {
      codec: 'AAC',
      packetType,
      audioSpecificConfig: reader.read(),
    };
    case 1: return {
      codec: 'AAC',
      packetType,
      data: reader.read(),
    };
    default:
      return null;
  }
};

export const handle_audio = (message: AudioMessage): AudioData | null => {
  const reader = new ByteReader(message.data);

  const meta = reader.readU8();
  const codec = (meta & 0xF0) >> 4;
  const rate = (meta & 0x0C) >> 2;
  const size = (meta & 0x02) >> 1;
  const type = (meta & 0x01) >> 0;

  switch (codec) {
    case AudioCodecType.AAC: {
      // In AAC: rate, size, type are derived in AudioSpecificConfig
      const aac = handle_aac(reader);
      if (aac == null) { return null; }
      return { kind: 'Audio', timestamp: message.timestamp, ... aac };
    }
    default:
      return null;
  }
};

export const handle_amf0_data = (message: AMF0DataMessage): ActionScriptData | null => {
  const values = read_amf0(message.data);
  return { kind: 'Data', timestamp: message.timestamp, values };
};

export default (message: Message): VideoData | AudioData | ActionScriptData | null => {
  switch (message.message_type_id) {
    case MessageType.Video: return handle_video(message as VideoMessage);
    case MessageType.Audio: return handle_audio(message as AudioMessage);
    case MessageType.DataAMF0: return handle_amf0_data(message as AMF0DataMessage);
    default: return null;
  }
};
