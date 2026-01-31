import ByteBuilder from './byte-builder.mts';
import type { Message } from './message.mts';
import { MessageType, UserControlType } from './message.mts';

type LengthOmittedMessage = Omit<Message, 'message_length'>;

export type SetChunkSize = LengthOmittedMessage & {
  message_type_id: typeof MessageType.SetChunkSize;
  message_stream_id: 0;
};
export const SetChunkSize = {
  from({ chunk_size, timestamp }: { chunk_size: number; timestamp: number; }): SetChunkSize {
    const builder = new ByteBuilder();
    builder.writeU32BE(chunk_size % (2 ** 31));
    return {
      message_type_id: MessageType.SetChunkSize,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export type Abort = LengthOmittedMessage & {
  message_type_id: typeof MessageType.Abort;
  message_stream_id: 0;
};
export const Abort = {
  from({ cs_id, timestamp }: { cs_id: number; timestamp: number; } ): Abort {
    const builder = new ByteBuilder();
    builder.writeU32BE(cs_id);
    return {
      message_type_id: MessageType.Abort,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export type Acknowledgement = LengthOmittedMessage & {
  message_type_id: typeof MessageType.Acknowledgement;
  message_stream_id: 0;
};
export const Acknowledgement = {
  from({ sequence_number, timestamp }: { sequence_number: number; timestamp: number; }): Acknowledgement {
    const builder = new ByteBuilder();
    builder.writeU32BE(sequence_number);
    return {
      message_type_id: MessageType.Acknowledgement,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export type WindowAcknowledgementSize = LengthOmittedMessage & {
  message_type_id: typeof MessageType.WindowAcknowledgementSize;
  message_stream_id: 0;
};
export const WindowAcknowledgementSize = {
  from({ ack_window_size, timestamp }: { ack_window_size: number; timestamp: number; }): WindowAcknowledgementSize {
    const builder = new ByteBuilder();
    builder.writeU32BE(ack_window_size);
    return {
      message_type_id: MessageType.WindowAcknowledgementSize,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export type SetPeerBandwidth = LengthOmittedMessage & {
  message_type_id: typeof MessageType.SetPeerBandwidth;
  message_stream_id: 0;
};
export const SetPeerBandwidth = {
  from({ ack_window_size, limit_type, timestamp }: { ack_window_size: number; limit_type: number; timestamp: number; }): SetPeerBandwidth {
    const builder = new ByteBuilder();
    builder.writeU32BE(ack_window_size);
    builder.writeU8(limit_type);
    return {
      message_type_id: MessageType.SetPeerBandwidth,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export type UserControl = LengthOmittedMessage & {
  message_type_id: typeof MessageType.UserControl;
  message_stream_id: 0;
};
export const StreamBegin = {
  from({ message_stream_id, timestamp }: { message_stream_id: number; timestamp: number; }): UserControl {
    const builder = new ByteBuilder();
    builder.writeU16BE(UserControlType.StreamBegin);
    builder.writeU32BE(message_stream_id);
    return {
      message_type_id: MessageType.UserControl,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export const StreamEOF = {
  from({ message_stream_id, timestamp }: { message_stream_id: number; timestamp: number; }): UserControl {
    const builder = new ByteBuilder();
    builder.writeU16BE(UserControlType.StreamEOF);
    builder.writeU32BE(message_stream_id);
    return {
      message_type_id: MessageType.UserControl,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export const StreamDry = {
  from({ message_stream_id, timestamp }: { message_stream_id: number; timestamp: number; }): UserControl {
    const builder = new ByteBuilder();
    builder.writeU16BE(UserControlType.StreamDry);
    builder.writeU32BE(message_stream_id);
    return {
      message_type_id: MessageType.UserControl,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export const SetBufferLength = {
  from({ message_stream_id, buffer_size, timestamp }: { message_stream_id: number; buffer_size: number; timestamp: number; }): UserControl {
    const builder = new ByteBuilder();
    builder.writeU16BE(UserControlType.SetBufferLength);
    builder.writeU32BE(message_stream_id);
    builder.writeU32BE(buffer_size);
    return {
      message_type_id: MessageType.UserControl,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export const StreamIsRecorded = {
  from({ message_stream_id, timestamp }: { message_stream_id: number; timestamp: number; }): UserControl {
    const builder = new ByteBuilder();
    builder.writeU16BE(UserControlType.StreamIsRecorded);
    builder.writeU32BE(message_stream_id);
    return {
      message_type_id: MessageType.UserControl,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export const PingRequest = {
  from({ event_timestamp, timestamp }: { event_timestamp: number; timestamp: number; }): UserControl {
    const builder = new ByteBuilder();
    builder.writeU16BE(UserControlType.PingRequest);
    builder.writeU32BE(event_timestamp);
    return {
      message_type_id: MessageType.UserControl,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};
export const PingResponse = {
  from({ event_timestamp, timestamp }: { event_timestamp: number; timestamp: number; }): UserControl {
    const builder = new ByteBuilder();
    builder.writeU16BE(UserControlType.PingResponse);
    builder.writeU32BE(event_timestamp);
    return {
      message_type_id: MessageType.UserControl,
      message_stream_id: 0,
      timestamp,
      data: builder.build(),
    };
  },
};

type TimestampInformation = {
  timestamp: number;
  is_extended_timestamp: boolean;
};
export default class MessageBuilder {
  private chunk_maximum_size = 128;
  private next_cs_id = 3;
  private cs_id_map = new Map<number, number>();
  private cs_id_timestamp_information = new Map<number, TimestampInformation>();

  private static cs_id_hash(message: LengthOmittedMessage, track: number = 0): number {
    if (MessageBuilder.use_system_cs_id(message) != null) {
      track = 0; // system 予約されている場合は track による多重化を行わない
    }
    const { message_stream_id, message_type_id } = message;
    return message_stream_id * (2 ** 16) + message_type_id * (2 ** 8) + track;
  }
  private static use_system_cs_id({ message_type_id }: LengthOmittedMessage): number | null {
    // Protocol Control Message と User Control Message は cs_id は必ず 2 を使う
    switch (message_type_id) {
      // Protocol Control Message
      case MessageType.SetChunkSize:
      case MessageType.Abort:
      case MessageType.Acknowledgement:
      case MessageType.WindowAcknowledgementSize:
      case MessageType.SetPeerBandwidth:
      // User Control Message
      case MessageType.UserControl:
        return 2;
    }
    return null;
  }

  private get_cs_id(message: LengthOmittedMessage, track: number = 0): number {
    const hash = MessageBuilder.cs_id_hash(message, track);
    if (this.cs_id_map.has(hash)) {
      return this.cs_id_map.get(hash)!;
    }
    const cs_id = MessageBuilder.use_system_cs_id(message) ?? this.next_cs_id++;
    this.cs_id_map.set(hash, cs_id);
    return cs_id;
  }

  private get_timestamp_information(message: LengthOmittedMessage): TimestampInformation | undefined {
    return this.cs_id_timestamp_information.get(MessageBuilder.cs_id_hash(message));
  }
  private static calculate_timestamp(message: LengthOmittedMessage, previous?: TimestampInformation): number {
    return (message.timestamp - (previous?.timestamp ?? 0));
  }
  private static is_extended_timestamp_required(message: LengthOmittedMessage, previous?: TimestampInformation): boolean {
    return MessageBuilder.calculate_timestamp(message, previous) >= 0xFFFFFF;
  };
  private set_timestamp_information(message: LengthOmittedMessage, previous?: TimestampInformation): void {
    this.cs_id_timestamp_information.set(MessageBuilder.cs_id_hash(message), {
      timestamp: message.timestamp,
      is_extended_timestamp: MessageBuilder.is_extended_timestamp_required(message, previous),
    });
  }

  public build(message: LengthOmittedMessage, track: number = 0): Buffer[] {
    const chunks: Buffer[] = [];

    const cs_id = this.get_cs_id(message, track);
    const previous_timestamp_information = this.get_timestamp_information(message);
    const is_extended_timestamp = MessageBuilder.is_extended_timestamp_required(message, previous_timestamp_information);
    const timestamp = MessageBuilder.calculate_timestamp(message, previous_timestamp_information);

    for (let i = 0; i < message.data.byteLength; i += this.chunk_maximum_size) {
      const builder = new ByteBuilder();
      const chunk = message.data.subarray(i, Math.min(message.data.byteLength, i + this.chunk_maximum_size));

      const fmt = i !== 0 ? 3 : previous_timestamp_information != null ? 1 : 0;
      if (cs_id >= 320) {
        builder.writeU8((fmt << 6) | 1);
        builder.writeU16LE(cs_id - 64);
      } else if (cs_id >= 64) {
        builder.writeU8((fmt << 6) | 0);
        builder.writeU8(cs_id - 64);
      } else {
        builder.writeU8((fmt << 6) | cs_id);
      }

      if (fmt === 3 || fmt === 1) {
        if (fmt === 1) {
          builder.writeU24BE(is_extended_timestamp ? 0xFFFFFF : timestamp);
          builder.writeU24BE(message.data.byteLength);
          builder.writeU8(message.message_type_id);
        }
        if (is_extended_timestamp) {
          builder.writeU32BE(timestamp);
        }
        builder.write(chunk);

        chunks.push(builder.build());
        continue;
      }

      builder.writeU24BE(is_extended_timestamp ? 0xFFFFFF : timestamp);
      builder.writeU24BE(message.data.byteLength);
      builder.writeU8(message.message_type_id);
      builder.writeU32LE(message.message_stream_id);
      if (is_extended_timestamp) {
        builder.writeU32BE(timestamp);
      }
      builder.write(chunk);

      chunks.push(builder.build());
    }

    if (message.message_type_id === MessageType.SetChunkSize) {
      this.chunk_maximum_size = message.data.readUint32BE(0) % (2 ** 31);
    }

    this.set_timestamp_information(message, previous_timestamp_information ?? undefined);
    return chunks;
  }
}
