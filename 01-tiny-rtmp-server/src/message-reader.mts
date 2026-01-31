import AsyncByteReader from './async-byte-reader.mts';
import ByteBuilder from './byte-builder.mts';
import { MessageType } from './message.mts';
import type { Message } from './message.mts';

export class InsufficientChunkError extends Error {
  constructor(message: string, option?: ErrorOptions) {
    super(message, option);
    this.name = this.constructor.name;
  }
}

export class MessageLengthExceededError extends Error {
  constructor(message: string, option?: ErrorOptions) {
    super(message, option);
    this.name = this.constructor.name;
  }
}

type MessageInformation = Omit<Message, 'data'> & {
  message_length: number;
  timestamp_delta: number | null;
  is_extended_timestamp: boolean;
};

export default async function* read_message(reader: AsyncByteReader): AsyncIterable<Message> {
  let chunk_maximum_size = 128; // システムメッセージにより変化する
  const informations = new Map<number, MessageInformation>();
  const chunks = new Map<number, ByteBuilder>();

  while (true) {
    const basic = await reader.readU8();
    const fmt = (basic & 0b11000000) >> 6;
    let cs_id = (basic & 0b00111111) >> 0;
    switch (cs_id) {
      case 0: cs_id = 64 + await reader.readU8(); break;
      case 1: cs_id = 64 + await reader.readU16LE(); break;
    }
    if (fmt !== 3 || !chunks.has(cs_id)) { chunks.set(cs_id, new ByteBuilder()); }
    const chunk_builder = chunks.get(cs_id)!;

    let information = informations.get(cs_id);
    let timestamp = fmt !== 3 ? await reader.readU24BE() : information?.timestamp;
    const message_length = fmt === 0 || fmt === 1 ? await reader.readU24BE() : information?.message_length;
    const message_type_id = fmt === 0 || fmt === 1 ? await reader.readU8() : information?.message_type_id;
    const message_stream_id = fmt === 0 ? await reader.readU32LE() : information?.message_stream_id;
    // fmt === 3 の時は extended_timestamp があるかどうかも以前を引き継ぐ
    const is_extended_timestamp = fmt !== 3 ? timestamp === 0xFFFFFF : information?.is_extended_timestamp;
    // チャンクに必要な情報がない時は何もできないしパースもできないため、例外で通知する
    if (timestamp == null || message_length == null || message_type_id == null || message_stream_id == null || is_extended_timestamp == null) {
      throw new InsufficientChunkError('Insufficient Chunk Information in RTMP Message Recieving');
    }
    const extended_timestamp = is_extended_timestamp ? await reader.readU32BE() : null;

    let timestamp_delta = null;
    if (fmt === 1 || fmt === 2) {
      if (information?.timestamp == null) {
        throw new InsufficientChunkError('Insufficient Chunk Information in RTMP Message Recieving');
      }
      timestamp_delta = extended_timestamp ?? timestamp; // // if fmt === 1 or fmt === 2, timestamp is delta
      timestamp = information.timestamp + timestamp_delta;
    } else if (fmt === 3) {
      timestamp_delta = extended_timestamp ?? information?.timestamp_delta ?? timestamp; // fmt === 3, timestamp is previous
      timestamp += (chunk_builder.byteLength() > 0) ? 0 : timestamp_delta;
    } else {
      timestamp = extended_timestamp ?? timestamp;
    }

    information = { message_type_id, message_stream_id, message_length, timestamp, timestamp_delta, is_extended_timestamp } satisfies MessageInformation;
    const current_chunk = await reader.read(Math.min(message_length - chunk_builder.byteLength(), chunk_maximum_size));
    chunk_builder.write(current_chunk);
    const length = chunk_builder.byteLength();
    if (length > message_length) {
      throw new MessageLengthExceededError(`Message Overflow (expected: ${message_length}, actual: ${length})`);
    }
    if (length === message_length) {
      const data = chunk_builder.build();
      switch (message_type_id) {
        case MessageType.SetChunkSize:
          chunk_maximum_size = data.readUInt32BE(0) % (2 ** 31);
          break;
        case MessageType.Abort: {
          const cs_id = data.readUInt32BE(0);
          chunks.delete(cs_id);
          informations.delete(cs_id);
          break;
        }
        default: {
          const { timestamp_delta, is_extended_timestamp, ... message } = information;
          yield { ... message, data };
          break;
        }
      }

      chunks.delete(cs_id);
    }
    informations.set(cs_id, information);
  }
}
