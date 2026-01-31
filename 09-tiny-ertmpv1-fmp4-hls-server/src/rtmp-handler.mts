import { MessageType } from '../../01-tiny-rtmp-server/src/message.mts';
import type { Message } from '../../01-tiny-rtmp-server/src/message.mts';
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

export const PacketType = {
  SequenceStart: 0,
  CodedFrames: 1,
  SequenceEnd: 2,
  CodedFramesX: 3, // ertmp で定義された HEVC で cto = 0 の時に cto 省略する PacketType.CodedFrames の亜種
  Metadata: 4,
  MPEG2TSSequenceStart: 5,
} as const;

export type AVCData = {
  codec: 'AVC';
} & ({
  packetType: typeof PacketType.SequenceStart;
  avcDecoderConfigurationRecord: Buffer;
} | {
  packetType: typeof PacketType.CodedFrames;
  compositionTimeOffset: number;
  data: Buffer;
});
export type HEVCData = {
  codec: 'HEVC';
} & ({
  packetType: typeof PacketType.SequenceStart;
  hevcDecoderConfigurationRecord: Buffer;
} | {
  packetType: typeof PacketType.CodedFrames;
  compositionTimeOffset: number;
  data: Buffer;
});
export type VideoData = (AVCData | HEVCData) & {
  timestamp: number;
  frameType: number;
  kind: 'Video';
};

export const AACPacketType = {
  SequenceHeader: 0,
  Raw: 1,
} as const;
export type AACData = {
  codec: 'AAC';
} & ({
  packetType: typeof AACPacketType.SequenceHeader;
  audioSpecificConfig: Buffer;
} | {
  packetType: typeof AACPacketType.Raw;
  data: Buffer;
});
export type AudioData = AACData & {
  timestamp: number;
  kind: 'Audio';
};

export type ActionScriptData = {
  timestamp: number;
  kind: 'Data';
  values: any[];
};

const handle_avc = (reader: ByteReader): AVCData | null => {
  const packetType = reader.readU8();
  const compositionTimeOffset = reader.readI24BE();

  switch (packetType) {
    case PacketType.SequenceStart: return {
      codec: 'AVC',
      packetType,
      avcDecoderConfigurationRecord: reader.read(),
    };
    case PacketType.CodedFrames: return {
      codec: 'AVC',
      packetType,
      compositionTimeOffset,
      data: reader.read(),
    };
    default:
      return null;
  }
};

const handle_hevc = (packetType: number, reader: ByteReader): HEVCData | null => {
  switch (packetType) {
    case PacketType.SequenceStart: return {
      codec: 'HEVC',
      packetType,
      hevcDecoderConfigurationRecord: reader.read(),
    };
    case PacketType.CodedFrames: {
      const compositionTimeOffset = reader.readI24BE();
      return {
        codec: 'HEVC',
        packetType,
        compositionTimeOffset,
        data: reader.read(),
      };
    }
    case PacketType.CodedFramesX: {
      return {
        codec: 'HEVC',
        packetType: PacketType.CodedFrames,
        compositionTimeOffset: 0,
        data: reader.read(),
      };
    }
    default:
      return null;
  }
};

export const handle_video = (message: VideoMessage): VideoData | null => {
  const reader = new ByteReader(message.data);

  const meta = reader.readU8();
  const isExHeader = (meta & 0x80) !== 0;
  const frameType = (meta & 0xF0) >> 4;

  if (!isExHeader) {
    const codec = (meta & 0x0F) >> 0;

    switch (codec) {
      case VideoCodecType.AVC: {
        const avc = handle_avc(reader);
        if (avc == null) { return null; }
        return { kind: 'Video', frameType, timestamp: message.timestamp, ... avc };
      }
      default:
        return null;
    }
  } else {
    const packetType = (meta & 0x0F) >> 0;
    const fourcc = reader.read(4).toString('ascii');

    switch (fourcc) {
      case 'hvc1': {
        const hevc = handle_hevc(packetType, reader);
        if (hevc == null) { return null; }
        return { kind: 'Video', frameType, timestamp: message.timestamp, ... hevc };
      }
      default:
        return null;
    }
  }
};

const handle_aac = (reader: ByteReader): AACData | null => {
  const packetType = reader.readU8();
  switch (packetType) {
    case AACPacketType.SequenceHeader: return {
      codec: 'AAC',
      packetType,
      audioSpecificConfig: reader.read(),
    };
    case AACPacketType.Raw: return {
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
