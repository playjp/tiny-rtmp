import ByteBuilder from './byte-builder.mts';
import { Message } from './message.mts';
import type { SerializedMessage } from './message.mts';
import { MessageType } from './message.mts';

export type MessageWithTrack = Message & {
  track?: number;
};

type TimestampInformation = {
  timestamp: number;
  is_extended_timestamp: boolean;
};

type SendingMessage = Message & {
  chunk_stream_id: number;
  binary: Buffer;
  offset: number;
}

export type MessageWriterOption = {
  signal?: AbortSignal;
};

export default class MessageWriter {
  private chunk_maximum_size = 128;
  private next_cs_id = 3;
  private cs_id_map = new Map<number, number>();
  private cs_id_timestamp_information = new Map<number, TimestampInformation>();

  private sending_controller: AbortController = new AbortController();;
  private sending_signal: AbortSignal;
  private sending_promise: Promise<void>;
  private sending_notify: () => void;
  private sending = new Set<SendingMessage>();

  private ended_boolean: boolean;
  private ended_promise: Promise<void>;
  private ended_notify: () => void;

  public constructor(option?: MessageWriterOption) {
    this.sending_signal = AbortSignal.any([this.sending_controller.signal, option?.signal ?? AbortSignal.any([])]);
    {
      const { promise, resolve } = Promise.withResolvers<void>();
      this.sending_promise = promise;
      this.sending_notify = resolve;
    }
    {
      this.ended_boolean = false;
      const { promise, resolve } = Promise.withResolvers<void>();
      this.ended_promise = promise;
      this.ended_notify = resolve;
    }
  }

  private static cs_id_hash(message: MessageWithTrack): number {
    const { message_stream_id, message_type_id } = message;
    if (MessageWriter.use_system_cs_id(message) != null) {
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
    const hash = MessageWriter.cs_id_hash(message);
    if (this.cs_id_map.has(hash)) {
      return this.cs_id_map.get(hash)!;
    }
    const cs_id = MessageWriter.use_system_cs_id(message) ?? this.next_cs_id++;
    this.cs_id_map.set(hash, cs_id);
    return cs_id;
  }

  private get_timestamp_information(message: SendingMessage): TimestampInformation | undefined {
    return this.cs_id_timestamp_information.get(message.chunk_stream_id);
  }
  private static calculate_timestamp(message: SendingMessage, previous?: TimestampInformation): number {
    return (message.timestamp - (previous?.timestamp ?? 0));
  }
  private static is_extended_timestamp_required(message: SendingMessage, previous?: TimestampInformation): boolean {
    return MessageWriter.calculate_timestamp(message, previous) >= 0xFFFFFF;
  };
  private set_timestamp_information(message: SendingMessage, previous?: TimestampInformation): void {
    this.cs_id_timestamp_information.set(message.chunk_stream_id, {
      timestamp: message.timestamp,
      is_extended_timestamp: MessageWriter.is_extended_timestamp_required(message, previous),
    });
  }
  private delete_timestamp_information(message: SendingMessage): void {
    this.cs_id_timestamp_information.delete(message.chunk_stream_id);
  }

  public async *retrieve(): AsyncIterable<Buffer> {
    while (true) {
      if (this.sending_signal.aborted) {
        this.ended_boolean = true;
        this.ended_notify();
        return;
      }
      await this.sending_promise;
      const { promise, resolve } = Promise.withResolvers<void>();
      this.sending_promise = promise;
      this.sending_notify = resolve;

      if (this.sending.size === 0 && this.ended_boolean) {
        this.ended_notify();
        return;
      }

      while (this.sending.size > 0) {
        for (const message of Array.from(this.sending)) { //
          const info = this.get_timestamp_information(message);
          const is_extended_timestamp = MessageWriter.is_extended_timestamp_required(message, info);
          const timestamp = MessageWriter.calculate_timestamp(message, info);

          const builder = new ByteBuilder();
          const chunk = message.binary.subarray(message.offset, Math.min(message.binary.byteLength, message.offset + this.chunk_maximum_size));

          const fmt = message.offset !== 0 ? 3 : info != null ? 1 : 0;
          if (message.chunk_stream_id >= 320) {
            builder.writeU8((fmt << 6) | 1);
            builder.writeU16LE(message.chunk_stream_id - 64);
          } else if (message.chunk_stream_id >= 64) {
            builder.writeU8((fmt << 6) | 0);
            builder.writeU8(message.chunk_stream_id - 64);
          } else {
            builder.writeU8((fmt << 6) | message.chunk_stream_id);
          }

          if (fmt === 3 || fmt === 1) {
            if (fmt === 1) {
              builder.writeU24BE(is_extended_timestamp ? 0xFFFFFF : timestamp);
              builder.writeU24BE(message.binary.byteLength);
              builder.writeU8(message.message_type_id);
            }
            if (is_extended_timestamp) {
              builder.writeU32BE(timestamp);
            }
            builder.write(chunk);
          } else {
            builder.writeU24BE(is_extended_timestamp ? 0xFFFFFF : timestamp);
            builder.writeU24BE(message.binary.byteLength);
            builder.writeU8(message.message_type_id);
            builder.writeU32LE(message.message_stream_id);
            if (is_extended_timestamp) {
              builder.writeU32BE(timestamp);
            }
            builder.write(chunk);
          }

          yield builder.build();

          const next = Math.min(message.binary.byteLength, message.offset + this.chunk_maximum_size)
          if (next < (message.binary.byteLength)) {
            message.offset = next;
          } else {
            if (message.message_type_id === MessageType.SetChunkSize) {
              this.chunk_maximum_size = message.data.chunk_size;
            }

            if (message.message_type_id === MessageType.Abort) {
              this.delete_timestamp_information(message);
            } else {
              this.set_timestamp_information(message, info ?? undefined);
            }
            this.sending.delete(message);
          }
        }
      }
    }
  }

  public write(message: MessageWithTrack): void {
    if (this.sending_signal.aborted) { return; }

    const cs_id = this.get_cs_id(message);
    this.sending.add({
      ... message,
      binary: Message.into(message).data,
      chunk_stream_id: cs_id,
      offset: 0,
    });
    this.sending_notify();
  }

  public end(): void {
    this.ended_boolean = true;
    this.sending_notify();
  }

  public [Symbol.dispose](): void {
    this.end();
  }

  public ended(): Promise<void> {
    return this.ended_promise;
  }

  public abort(): void {
    this.sending_controller.abort();
  }
}
