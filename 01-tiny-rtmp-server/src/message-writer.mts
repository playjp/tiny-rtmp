import ByteBuilder from './byte-builder.mts';
import { Message } from './message.mts';
import { MessageType } from './message.mts';
import Queue from './queue.mts';

export type MessageWithTrack = Message & {
  track?: number;
};
export const MessageWithTrack = {
  from(message: Message, track?: number): MessageWithTrack {
    return {
      ... message,
      track,
    };
  }
};


type SendingMessage = Message & {
  chunk_stream_id: number;
  binary: Buffer;
  offset: number;
};

export type MessageWriterOption = {
  signal?: AbortSignal;
};

export default class MessageWriter {
  private chunk_maximum_size = 128;
  private next_cs_id = 3;
  private cs_id_map = new Map<number, number>();
  private cs_id_timestamp_information = new Map<number, number>();

  private sending_controller: AbortController = new AbortController();
  private sending_signal: AbortSignal;
  private sending_promise: Promise<void>;
  private sending_notify: () => void;
  private sending_ordering_queue = new Queue<SendingMessage>();
  private sending_cs_id_queues = new Map<number, Queue<SendingMessage>>();

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
    if (MessageWriter.use_system_cs_id(message)) {
      // システムのメッセージの場合は track による cs_id の多重化はしない
      return message_stream_id * (2 ** 16) + message_type_id * (2 ** 8) + 0;
    }
    return message_stream_id * (2 ** 16) + message_type_id * (2 ** 8) + (message.track ?? 0);
  }
  private static use_system_cs_id({ message_type_id }: MessageWithTrack): boolean {
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
        return true;
    }
    return false;
  }
  private static is_input_order_sensitive({ message_type_id }: MessageWithTrack): boolean {
    // 映像・音声データの伝送を確立するためのメッセージは順序を維持するようにする
    switch (message_type_id) {
      // Protocol Control Message
      case MessageType.SetChunkSize:
      case MessageType.Abort:
      case MessageType.Acknowledgement:
      case MessageType.WindowAcknowledgementSize:
      case MessageType.SetPeerBandwidth:
      // User Control Message
      case MessageType.UserControl:
      // Command AMF
      case MessageType.CommandAMF0:
      case MessageType.CommandAMF3:
        return true;
    }
    return false;
  }

  private get_cs_id(message: MessageWithTrack): number {
    const hash = MessageWriter.cs_id_hash(message);
    if (this.cs_id_map.has(hash)) {
      return this.cs_id_map.get(hash)!;
    }
    const cs_id = MessageWriter.use_system_cs_id(message) ? 2 : this.next_cs_id++;
    this.cs_id_map.set(hash, cs_id);
    return cs_id;
  }

  private get_timestamp(message: SendingMessage): number | undefined {
    return this.cs_id_timestamp_information.get(message.chunk_stream_id);
  }
  private static calculate_timestamp(message: SendingMessage, previous?: number): number {
    return (message.timestamp - (previous ?? 0));
  }
  private set_timestamp_information(message: SendingMessage): void {
    this.cs_id_timestamp_information.set(message.chunk_stream_id, message.timestamp);
  }
  private delete_timestamp_information(cs_id: number): void {
    this.cs_id_timestamp_information.delete(cs_id);
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

      let all_empty = true;
      const empty_set = new Set<number>();
      for (const [cs_id, queue] of this.sending_cs_id_queues.entries()) {
        if (queue.empty()) { empty_set.add(cs_id); continue; }
        all_empty = false;

        const message = queue.peek()!;
        const previous = this.get_timestamp(message);
        const timestamp = MessageWriter.calculate_timestamp(message, previous);
        const is_extended_timestamp = timestamp >= 0xFFFFFF;

        const builder = new ByteBuilder();
        const next_offset = Math.min(message.binary.byteLength, message.offset + this.chunk_maximum_size);
        const is_complete = next_offset >= message.binary.byteLength;
        // 投入順に完成するように、投入順とは違う完成は防ぐ
        if (is_complete && MessageWriter.is_input_order_sensitive(message) && this.sending_ordering_queue.peek() !== message) {
          continue;
        }
        const chunk = message.binary.subarray(message.offset, next_offset);

        const fmt = message.offset !== 0 ? 3 : previous != null ? 1 : 0;
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

        if (next_offset < (message.binary.byteLength)) {
          message.offset = next_offset;
        } else {
          if (MessageWriter.is_input_order_sensitive(message)) {
            this.sending_ordering_queue.pop();
          }
          queue.pop();

          if (message.message_type_id === MessageType.SetChunkSize) {
            this.chunk_maximum_size = message.data.chunk_size;
          }

          if (message.message_type_id === MessageType.Abort) {
            this.delete_timestamp_information(message.data.chunk_stream_id);
          } else {
            this.set_timestamp_information(message);
          }
        }
      }

      // 消しこみ
      for (const cs_id of empty_set) {
        this.sending_cs_id_queues.delete(cs_id);
      }

      // 終了要求が来ていて、追加がない状態で全部なくなったら終了
      if (all_empty && this.ended_boolean) {
        this.ended_notify();
        return;
      }

      // 残りがあるなら継続する
      if (!all_empty) {
        this.sending_notify();
      }
    }
  }

  public write(message: MessageWithTrack): void {
    if (this.sending_signal.aborted) { return; }
    if (this.ended_boolean) { return;}

    const cs_id = this.get_cs_id(message);
    if (!this.sending_cs_id_queues.has(cs_id)) {
      this.sending_cs_id_queues.set(cs_id, new Queue<SendingMessage>());
    }
    const queue = this.sending_cs_id_queues.get(cs_id)!
    const sending = {
      ... message,
      binary: Message.into(message).data,
      chunk_stream_id: cs_id,
      offset: 0,
    } satisfies SendingMessage;
    queue.push(sending);
    if (MessageWriter.is_input_order_sensitive(sending)) {
      this.sending_ordering_queue.push(sending);
    }
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
