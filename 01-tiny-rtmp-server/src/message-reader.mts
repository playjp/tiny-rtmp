import AsyncByteReader from './async-byte-reader.mts';
import ByteBuilder from './byte-builder.mts';
import { Message, MessageType } from './message.mts';
import type { SerializedMessage } from './message.mts';
import { logger } from './logger.mts';

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

export class ReceiveBufferLimitError extends Error {
  constructor(message: string, option?: ErrorOptions) {
    super(message, option);
    this.name = this.constructor.name;
  }
}

type MessageInformation = Omit<SerializedMessage, 'data'> & {
  message_length: number;
  timestamp_delta: number | null;
  is_extended_timestamp: boolean;
};

export type MessageReaderOption = Partial<{
  highWaterMark: number;
}>;

export default async function* read_message(reader: AsyncByteReader, option?: MessageReaderOption): AsyncIterable<Message> {
  const highWaterMark = option?.highWaterMark ?? Number.POSITIVE_INFINITY;
  let buffered = 0;

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
    if (fmt !== 3 || !chunks.has(cs_id)) {
      buffered -= chunks.get(cs_id)?.byteLength() ?? 0;
      chunks.set(cs_id, new ByteBuilder());
    }
    const chunk_builder = chunks.get(cs_id)!;

    let information = informations.get(cs_id);
    let timestamp = fmt !== 3 ? await reader.readU24BE() : information?.timestamp;
    const message_length = fmt === 0 || fmt === 1 ? await reader.readU24BE() : information?.message_length;
    const message_type_id = fmt === 0 || fmt === 1 ? await reader.readU8() : information?.message_type_id;
    const message_stream_id = fmt === 0 ? await reader.readU32LE() : information?.message_stream_id;
    // fmt === 3 の時は extended_timestamp があるかどうかも以前を引き継ぐ
    const is_extended_timestamp = fmt !== 3 ? timestamp === 0xFFFFFF : information?.is_extended_timestamp;
    // チャンクに必要な情報がない時は何もできないしパースもできず、そのあとが保証できないので、例外で通知する
    if (timestamp == null || message_length == null || message_type_id == null || message_stream_id == null || is_extended_timestamp == null) {
      throw new InsufficientChunkError('Insufficient Chunk Information in RTMP Message Recieving');
    }
    const extended_timestamp = is_extended_timestamp ? await reader.readU32BE() : null;

    let timestamp_delta = null;
    if (fmt === 1 || fmt === 2) {
      if (information?.timestamp == null) {
        // チャンクに必要な情報がない時は何もできないしパースもできず、そのあとが保証できないので、例外で通知する
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
    buffered += current_chunk.byteLength;
    if (buffered >= highWaterMark) {
      throw new ReceiveBufferLimitError('Message Buffer Limit Exceeded');
    }

    const length = chunk_builder.byteLength();
    if (length > message_length) {
      throw new MessageLengthExceededError(`Message Overflow (expected: ${message_length}, actual: ${length})`);
    }
    if (length === message_length) {
      const data = chunk_builder.build();
      const message = Message.from({
        message_type_id: information.message_type_id,
        message_stream_id: information.message_stream_id,
        timestamp: information.timestamp,
        data,
      });

      if (message != null) {
        switch (message.message_type_id) {
          case MessageType.SetChunkSize:
            chunk_maximum_size = message.data.chunk_size;
            break;
          case MessageType.Abort: {
            const cs_id = message.data.chunk_stream_id;
            buffered -= chunks.get(cs_id)?.byteLength() ?? 0;
            chunks.delete(cs_id);
            informations.delete(cs_id);
            break;
          }
          default: {
            yield message;
            break;
          }
        }
      } else {
        logger.error('Message Decoding Failed, ignore it', information);
      }

      chunks.delete(cs_id);
      buffered -= data.byteLength;
    }
    informations.set(cs_id, information);
  }
}
