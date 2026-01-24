import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Duplex } from 'node:stream';

import AsyncByteReader from './async-byte-reader.mts';
import read_message, { MessageType } from './message-reader.mts';
import type { Message } from './message-reader.mts';
import read_amf0, { isAMF0Number, isAMF0Object, isAMF0String } from './amf0-reader.mts';
import write_amf0 from './amf0-writer.mts';
import MessageBuilder from './message-builder.mts';
import FLVWriter from './flv-writer.mts';

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
  [STATE.WAITING_CONNECT]: (message: Message, builder: MessageBuilder, connection: Duplex) => {
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

    const result = write_amf0('_result', transaction_id,
      {
        fmsVer: 'FMS/3,5,7,7009',
        capabilities: 31,
        mode: 1,
      }, {
        code: 'NetConnection.Connect.Success',
        description: 'Connection succeeded.',
        data: { version: '3,5,7,7009' },
        objectEncoding: 0, // 0 = AMF0, 3 = AMF3
        level: 'status', // 正常系
      },
    );
    const chunks = builder.build({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: 0,
      timestamp: 0,
      data: result,
    });
    for (const chunk of chunks) { connection.write(chunk); }

    return STATE.WAITING_CREATESTREAM;
  },
  [STATE.WAITING_CREATESTREAM]: (message: Message, builder: MessageBuilder, connection: Duplex) => {
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
  [STATE.WAITING_PUBLISH]: (message: Message, builder: MessageBuilder, connection: Duplex) => {
    if (message.message_stream_id !== PUBLISH_MESSAGE_STREAM) { return STATE.WAITING_PUBLISH; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.WAITING_PUBLISH; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'publish') { return STATE.WAITING_PUBLISH; }
    if (!isAMF0Number(command[1])) { return STATE.WAITING_PUBLISH; }
    const transaction_id = command[1];
    const streamKey = command[3];

    const info = {
      code: 'NetStream.Publish.Start',
      description: 'Publish Accepted',
      level: 'status', // 正常系
    };
    const result = write_amf0('onStatus', transaction_id, null, info);
    const chunks = builder.build({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: message.message_stream_id,
      timestamp: 0,
      data: result,
    });
    for (const chunk of chunks) { connection.write(chunk); }

    return STATE.PUBLISHED;
  },
  [STATE.PUBLISHED]: (message: Message, builder: MessageBuilder, connection: Duplex) => {
    if (message.message_stream_id !== 0) { return STATE.PUBLISHED; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.PUBLISHED; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'deleteStream') { return STATE.PUBLISHED; }
    const stream = command[3];
    if (stream !== PUBLISH_MESSAGE_STREAM) { return STATE.PUBLISHED; }

    return STATE.DISCONNECTED;
  },
  [STATE.DISCONNECTED]: (message: Message, builder: MessageBuilder, connection: Duplex) => {
    return STATE.DISCONNECTED;
  },
} as const satisfies Record<(typeof STATE)[keyof typeof STATE], (message: Message, builder: MessageBuilder, connection: Duplex) => (typeof STATE)[keyof typeof STATE]>;

async function* handle_rtmp(connection: Duplex): AsyncIterable<Message> {
  const controller = new AbortController();
  using reader = new AsyncByteReader({ signal: controller.signal });
  const builder = new MessageBuilder();
  connection.pipe(new Writable({
    write(data, _, cb) { reader.feed(data); cb(); },
  }));

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
      state = TRANSITION[state](message, builder, connection);
      if (state === STATE.DISCONNECTED) { return; }
    }
  } catch (e) {
    throw e;
  } finally {
    connection.end();
  }
}

export default async (connection: Duplex, output?: Writable): Promise<void> => {
  using writer = output != null ? new FLVWriter(output) : null;
  for await (const message of handle_rtmp(connection)) {
    switch (message.message_type_id) {
      case MessageType.Audio:
      case MessageType.Video:
        writer?.write(message);
        break;
      case MessageType.DataAMF0: {
        const command = read_amf0(message.data);
        const data = command.length === 3 && command[0] === '@setDataFrame' && command[1] === 'onMetaData' ? [command[1], command[2]] : command;
        writer?.write({ ... message, data: write_amf0(... data) });
        break;
      }
    }
  }
};
