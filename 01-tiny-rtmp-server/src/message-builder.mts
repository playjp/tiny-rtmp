import ByteBuilder from './byte-builder.mts';
import { Message } from './message.mts';
import { MessageType } from './message.mts';

export type MessageWithTrack = Message & {
  track?: number;
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

  private static cs_id_hash(message: MessageWithTrack): number {
    const { message_stream_id, message_type_id } = message;
    if (MessageBuilder.use_system_cs_id(message) != null) {
      // システムのメッセージの場合は track による cs_id の多重化はしない
      return message_stream_id * (2 ** 16) + message_type_id * (2 ** 8) + 0;
    }
    return message_stream_id * (2 ** 16) + message_type_id * (2 ** 8) + (message.track ?? 0);
  }
  private static use_system_cs_id({ message_type_id }: MessageWithTrack): number | null {
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

  private get_cs_id(message: MessageWithTrack): number {
    const hash = MessageBuilder.cs_id_hash(message);
    if (this.cs_id_map.has(hash)) {
      return this.cs_id_map.get(hash)!;
    }
    const cs_id = MessageBuilder.use_system_cs_id(message) ?? this.next_cs_id++;
    this.cs_id_map.set(hash, cs_id);
    return cs_id;
  }

  private get_timestamp_information(message: MessageWithTrack): TimestampInformation | undefined {
    return this.cs_id_timestamp_information.get(MessageBuilder.cs_id_hash(message));
  }
  private static calculate_timestamp(message: MessageWithTrack, previous?: TimestampInformation): number {
    return (message.timestamp - (previous?.timestamp ?? 0));
  }
  private static is_extended_timestamp_required(message: MessageWithTrack, previous?: TimestampInformation): boolean {
    return MessageBuilder.calculate_timestamp(message, previous) >= 0xFFFFFF;
  };
  private set_timestamp_information(message: MessageWithTrack, previous?: TimestampInformation): void {
    this.cs_id_timestamp_information.set(MessageBuilder.cs_id_hash(message), {
      timestamp: message.timestamp,
      is_extended_timestamp: MessageBuilder.is_extended_timestamp_required(message, previous),
    });
  }

  public build(message: MessageWithTrack): Buffer[] {
    const chunks: Buffer[] = [];

    const cs_id = this.get_cs_id(message);
    const previous_timestamp_information = this.get_timestamp_information(message);
    const is_extended_timestamp = MessageBuilder.is_extended_timestamp_required(message, previous_timestamp_information);
    const timestamp = MessageBuilder.calculate_timestamp(message, previous_timestamp_information);

    {
      const serialized = Message.into(message);
      for (let i = 0; i < serialized.data.byteLength; i += this.chunk_maximum_size) {
        const builder = new ByteBuilder();
        const chunk = serialized.data.subarray(i, Math.min(serialized.data.byteLength, i + this.chunk_maximum_size));

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
            builder.writeU24BE(serialized.data.byteLength);
            builder.writeU8(serialized.message_type_id);
          }
          if (is_extended_timestamp) {
            builder.writeU32BE(timestamp);
          }
          builder.write(chunk);

          chunks.push(builder.build());
          continue;
        }

        builder.writeU24BE(is_extended_timestamp ? 0xFFFFFF : timestamp);
        builder.writeU24BE(serialized.data.byteLength);
        builder.writeU8(serialized.message_type_id);
        builder.writeU32LE(serialized.message_stream_id);
        if (is_extended_timestamp) {
          builder.writeU32BE(timestamp);
        }
        builder.write(chunk);

        chunks.push(builder.build());
      }
    }

    if (message.message_type_id === MessageType.SetChunkSize) {
      this.chunk_maximum_size = message.data.chunk_size;
    }

    this.set_timestamp_information(message, previous_timestamp_information ?? undefined);
    return chunks;
  }
}
