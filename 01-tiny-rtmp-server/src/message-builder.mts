import ByteBuilder from './byte-builder.mts';
import type { Message } from './message-reader.mts';
import { MessageType } from './message-reader.mts';

type LengthOmittedMessage = Omit<Message, 'message_length'>;

export type SetChunkSize = LengthOmittedMessage & {
  message_type_id: typeof MessageType.SetChunkSize;
  message_stream_id: 0;
};
export const SetChunkSize = {
  from(size: number, timestamp: number): SetChunkSize {
    const builder = new ByteBuilder();
    builder.writeU32BE(size % (2 ** 31));
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
  from(cs_id: number, timestamp: number): Abort {
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
  from(sequence: number, timestamp: number): Acknowledgement {
    const builder = new ByteBuilder();
    builder.writeU32BE(sequence);
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
  from(window: number, timestamp: number): WindowAcknowledgementSize {
    const builder = new ByteBuilder();
    builder.writeU32BE(window);
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
  from(window: number, limit: number, timestamp: number): SetPeerBandwidth {
    const builder = new ByteBuilder();
    builder.writeU32BE(window);
    builder.writeU8(limit);
    return {
      message_type_id: MessageType.SetPeerBandwidth,
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

  private static cs_id_hash({ message_stream_id, message_type_id }: LengthOmittedMessage): number {
    return message_stream_id * 128 + message_type_id;
  }
  private static use_system_cs_id({ message_type_id }: LengthOmittedMessage): number | null {
    switch (message_type_id) {
      case 1:
      case 2:
      case 3:
      case 5:
      case 6:
        return 2;
    }
    return null;
  }

  private get_cs_id(message: LengthOmittedMessage): number {
    const hash = MessageBuilder.cs_id_hash(message);
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
  private static require_extended_timestamp(message: LengthOmittedMessage, previous?: TimestampInformation): boolean {
    return MessageBuilder.calculate_timestamp(message, previous) >= 0xFFFFFF;
  };
  private set_timestamp_information(message: LengthOmittedMessage, previous?: TimestampInformation): void {
    this.cs_id_timestamp_information.set(MessageBuilder.cs_id_hash(message), {
      timestamp: message.timestamp,
      is_extended_timestamp: MessageBuilder.require_extended_timestamp(message, previous),
    });
  }

  public build(message: LengthOmittedMessage): Buffer {
    const builder = new ByteBuilder();

    const cs_id = this.get_cs_id(message);
    const previous_timestamp_information = this.get_timestamp_information(message);
    const is_extended_timestamp = MessageBuilder.require_extended_timestamp(message, previous_timestamp_information);
    const timestamp = MessageBuilder.calculate_timestamp(message, previous_timestamp_information);

    for (let i = 0; i < message.data.byteLength; i += this.chunk_maximum_size) {
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
    }

    this.set_timestamp_information(message, previous_timestamp_information ?? undefined);
    return builder.build();
  }
}
