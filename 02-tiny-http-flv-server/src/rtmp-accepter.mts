import { Writable } from 'node:stream';
import type { Duplex } from 'node:stream';
import { randomBytes } from 'node:crypto';

import AsyncByteReader from '../../01-tiny-rtmp-server/src/async-byte-reader.mts';
import read_message, { MessageType } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import MessageBuilder from '../../01-tiny-rtmp-server/src/message-builder.mts';
import read_amf0, { isAMF0Number, isAMF0Object, isAMF0String } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import write_amf0 from '../../01-tiny-rtmp-server/src/amf0-writer.mts';

import BandwidthEstimator from './bandwidth-estimator.mts';

const handle_handshake = async (reader: AsyncByteReader, connection: Duplex): Promise<boolean> => {
  // C0/S0
  await reader.readU8(); // Read C0
  connection.write(Buffer.from([0x03])); // Write S0 (Version: 3)
  // C1/S1
  const c1 = await reader.read(1536); // read C1
  const c1_random = c1.subarray(8);
  const s1_random = randomBytes(1536 - 8);
  const s1 = Buffer.concat([Buffer.alloc(8), s1_random]);
  connection.write(s1); // write S1
  // C2/S2
  const s2 = Buffer.concat([Buffer.alloc(8), c1_random]);
  connection.write(s2); // write S2
  const c2 = await reader.read(1536); // read C2
  const c2_random_echo = c2.subarray(8);
  // Check Random Echo
  return s1_random.equals(c2_random_echo);
};

const STATE = {
  WAITING_CONNECT: 'WAITING_CONNECT',
  WAITING_CREATESTREAM: 'WAITING_CREATESTREAM',
  WAITING_PUBLISH: 'WAITING_PUBLISH',
  PUBLISHED: 'PUBLISHED',
  DISCONNECTED: 'DISCONNECTED',
} as const;

type Option = {
  app: string;
  streamKey: string;
};
const generate_key = (option: Option): string => `${option.app}/${option.streamKey}`;
const lock = new Set<ReturnType<typeof generate_key>>();

const PUBLISH_MESSAGE_STREAM = 1;
const need_yield = (state: (typeof STATE)[keyof typeof STATE], message: Message): boolean => {
  if (state !== STATE.PUBLISHED) { return false; }
  if (message.message_stream_id !== PUBLISH_MESSAGE_STREAM) { return false; }

  switch (message.message_type_id) {
    case MessageType.Audio: return true;
    case MessageType.Video: return true;
    case MessageType.DataAMF0: return true;
    default: return false;
  }
};
const TRANSITION = {
  [STATE.WAITING_CONNECT]: (message: Message, builder: MessageBuilder, connection: Duplex, option: Option) => {
    if (message.message_stream_id !== 0) { return STATE.WAITING_CONNECT; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.WAITING_CONNECT; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'connect') { return STATE.WAITING_CONNECT; }
    if (!isAMF0Number(command[1])) { return STATE.WAITING_CONNECT; }
    const transaction_id = command[1];
    if (!isAMF0Object(command[2])) { return STATE.WAITING_CONNECT; }
    const appName = command[2]['app'];
    if (!isAMF0String(appName)) { return STATE.WAITING_CONNECT; }
    const connectAccepted = appName === option.app;

    const status = connectAccepted ? '_result' : '_error';
    const server = connectAccepted ? {
      fmsVer: 'FMS/3,5,7,7009',
      capabilities: 31,
      mode: 1,
    } : null;
    const info = connectAccepted ? {
      code: 'NetConnection.Connect.Success',
      description: 'Connection succeeded.',
      data: { version: '3,5,7,7009' },
      objectEncoding: 0, // 0 = AMF0, 3 = AMF3
      level: 'status', // 正常系
    } : {
      code: 'NetConnection.Connect.Rejected',
      description: 'Connection rejected.',
      level: 'error', // 異常系
    };

    const result = write_amf0(status, transaction_id, server, info);
    const chunks = builder.build({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: 0,
      timestamp: 0,
      data: result,
    });
    for (const chunk of chunks) { connection.write(chunk); }

    if (!connectAccepted) { return STATE.DISCONNECTED; }
    return STATE.WAITING_CREATESTREAM;
  },
  [STATE.WAITING_CREATESTREAM]: (message: Message, builder: MessageBuilder, connection: Duplex, option: Option) => {
    if (message.message_stream_id !== 0) { return STATE.WAITING_CREATESTREAM; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.WAITING_CREATESTREAM; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'createStream') { return STATE.WAITING_CREATESTREAM; }
    if (!isAMF0Number(command[1])) { return STATE.WAITING_CREATESTREAM; }
    const transaction_id = command[1];

    // message_stream_id は 0 が予約されている (今使ってる) ので 1 を利用する
    const result = write_amf0('_result', transaction_id, null, PUBLISH_MESSAGE_STREAM);
    const chunks = builder.build({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: 0,
      timestamp: 0,
      data: result,
    });
    for (const chunk of chunks) { connection.write(chunk); }

    return STATE.WAITING_PUBLISH;
  },
  [STATE.WAITING_PUBLISH]: (message: Message, builder: MessageBuilder, connection: Duplex, option: Option) => {
    if (message.message_stream_id !== PUBLISH_MESSAGE_STREAM) { return STATE.WAITING_PUBLISH; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.WAITING_PUBLISH; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'publish') { return STATE.WAITING_PUBLISH; }
    if (!isAMF0Number(command[1])) { return STATE.WAITING_PUBLISH; }
    const transaction_id = command[1];
    const streamKey = command[3];
    const publishAccepted = streamKey === option.streamKey && !lock.has(generate_key(option)); // streamKey が合致していて、配信されてない場合は配信を許可する

    const info = publishAccepted ? {
      code: 'NetStream.Publish.Start',
      description: 'Publish Accepted',
      level: 'status', // 正常系
    } : {
      code: 'NetStream.Publish.Failed', // Permision Denied
      description: 'Publish Failed',
      level: 'error', // 異常系
    };

    const result = write_amf0('onStatus', transaction_id, null, info);
    const chunks = builder.build({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: message.message_stream_id,
      timestamp: 0,
      data: result,
    });
    for (const chunk of chunks) { connection.write(chunk); }

    if (!publishAccepted) { return STATE.DISCONNECTED; }
    lock.add(generate_key(option));
    return STATE.PUBLISHED;
  },
  [STATE.PUBLISHED]: (message: Message, builder: MessageBuilder, connection: Duplex, option: Option) => {
    if (message.message_stream_id !== 0) { return STATE.PUBLISHED; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.PUBLISHED; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'deleteStream') { return STATE.PUBLISHED; }
    const stream = command[3];
    if (stream !== PUBLISH_MESSAGE_STREAM) { return STATE.PUBLISHED; }

    return STATE.DISCONNECTED;
  },
  [STATE.DISCONNECTED]: (message: Message, builder: MessageBuilder, connection: Duplex, option: Option) => {
    return STATE.DISCONNECTED;
  },
} as const satisfies Record<(typeof STATE)[keyof typeof STATE], (message: Message, builder: MessageBuilder, connection: Duplex, option: Option) => (typeof STATE)[keyof typeof STATE]>;

export class DisconnectError extends Error {
  constructor(message: string, option?: ErrorOptions) {
    super(message, option);
    this.name = this.constructor.name;
  }
}

export default async function* handle_rtmp(connection: Duplex, app: string, key: string, limit?: number): AsyncIterable<Message> {
  const option = {
    app: app,
    streamKey: key,
  } satisfies Option;
  const controller = new AbortController();
  using reader = new AsyncByteReader({ signal: controller.signal });
  const builder = new MessageBuilder();
  using estimator = new BandwidthEstimator(limit ?? Number.POSITIVE_INFINITY, controller);
  connection.pipe(new Writable({
    write(data, _, cb) { reader.feed(data); estimator.feed(data.byteLength); cb(); },
  }));
  const disconnected = () => { controller.abort(new DisconnectError('Disconnected!')); };
  connection.addListener('close', disconnected);

  try {
    /*
    * RTMPのハンドシェイクを処理する
    */
    if (!await handle_handshake(reader, connection)) { return; }
    /*
    * RTMPのメッセージを処理する
    */
    let state: (typeof STATE)[keyof typeof STATE] = STATE.WAITING_CONNECT as (typeof STATE)[keyof typeof STATE];
    for await (const message of read_message(reader)) {
      // 共通で処理するメッセージはここで処理する

      // 上位に伝える映像/音声/データのメッセージだったら伝える
      if (need_yield(state, message)) { yield message; }

      // 個別のメッセージによる状態遷移
      state = TRANSITION[state](message, builder, connection, option);
      if (state === STATE.DISCONNECTED) { return; }
    }
  } catch (e) {
    throw e;
  } finally {
    connection.removeListener('close', disconnected);
    connection.end();
    lock.delete(generate_key(option));
  }
}
