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

export const AuthResult = {
  OK: 'OK',
  RETRY: 'RETRY',
  DISCONNECT: 'DISCONNECT',
} as const;
const strip_query = (value: string): string => {
  const query_index = value.indexOf('?');
  if (query_index < 0) { return value; }
  return value.slice(0, query_index);
};
const collect_query = (value: string): Record<string, string> | undefined => {
  const query_index = value.indexOf('?');
  if (query_index < 0) { return undefined; }
  return value.slice(query_index + 1).split('&').reduce((a, b) => {
    const index = b.indexOf('=');
    const key = index >= 0 ? b.slice(0, index) : b;
    const value = index >= 0 ? b.slice(index + 1) : '';
    return {
      ... a,
      [key]: value,
    };
  }, {}) as Record<string, string>;
};
type MaybePromise<T> = T | Promise<T>;
type AuthResultWithDescription = MaybePromise<[authResult: (typeof AuthResult)[keyof typeof AuthResult], description: string | null]>;
export interface AuthConfiguration {
  app(app: string): AuthResultWithDescription;
  streamKey(key: string): AuthResultWithDescription;
};
export const AuthConfiguration = {
  noAuth(): AuthConfiguration {
    return {
      app: () => [AuthResult.OK, null],
      streamKey: () => [AuthResult.OK, null],
    };
  },
  simpleAuth(appName: string, streamKey: string): AuthConfiguration {
    return {
      app: (app: string) => [strip_query(app) === appName ? AuthResult.OK : AuthResult.DISCONNECT, null],
      streamKey: (key: string) => [strip_query(key) === streamKey ? AuthResult.OK : AuthResult.DISCONNECT, null],
    };
  },
  customAuth(appFn: ((app: string, query?: Record<string, string>) => (boolean | Promise<boolean>)) | null, streamKeyFn: ((key: string, query?: Record<string, string>) => (boolean | Promise<boolean>)) | null): AuthConfiguration {
    return {
      app: async (app: string) => [(await (appFn?.(strip_query(app), collect_query(app))) ?? true) ? AuthResult.OK : AuthResult.DISCONNECT, null],
      streamKey: async (key: string) => [(await (streamKeyFn?.(strip_query(key), collect_query(key))) ?? true) ? AuthResult.OK : AuthResult.DISCONNECT, null],
    };
  },
};

export type RTMPContext = Partial<{
  app: string;
  streamKey: string;
}>;
export const RTMPContext = {
  from(): RTMPContext {
    return {};
  },
};
const generate_key = (context: RTMPContext): string => `${context.app}/${context.streamKey}`;
const lock = new Set<NonNullable<ReturnType<typeof generate_key>>>();

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
  [STATE.WAITING_CONNECT]: async (message: Message, builder: MessageBuilder, connection: Duplex, auth: AuthConfiguration, context: RTMPContext) => {
    if (message.message_stream_id !== 0) { return [STATE.WAITING_CONNECT, context]; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return [STATE.WAITING_CONNECT, context]; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'connect') { return [STATE.WAITING_CONNECT, context]; }
    if (!isAMF0Number(command[1])) { return [STATE.WAITING_CONNECT, context]; }
    const transaction_id = command[1];
    if (!isAMF0Object(command[2])) { return [STATE.WAITING_CONNECT, context]; }
    const app = command[2]['app'];
    if (!isAMF0String(app)) { return [STATE.WAITING_CONNECT, context]; }

    const [authResult, description] = await auth.app(app);
    const connectAccepted = authResult === AuthResult.OK;

    const status = connectAccepted ? '_result' : '_error';
    const server = connectAccepted ? {
      fmsVer: 'FMS/3,5,7,7009',
      capabilities: 31,
      mode: 1,
    } : null;
    const info = connectAccepted ? {
      code: 'NetConnection.Connect.Success',
      description: description ?? 'Connection succeeded.',
      data: { version: '3,5,7,7009' },
      objectEncoding: 0, // 0 = AMF0, 3 = AMF3
      level: 'status', // 正常系
    } : {
      code: 'NetConnection.Connect.Rejected',
      description: description ?? 'Connection rejected.',
      level: 'error', // 異常系
    };

    const next_context = connectAccepted ? { ... context, app: strip_query(app) } : context;
    const next = {
      [AuthResult.OK]: STATE.WAITING_CREATESTREAM,
      [AuthResult.RETRY]: STATE.WAITING_CONNECT,
      [AuthResult.DISCONNECT]: STATE.DISCONNECTED,
    } as const satisfies Record<(typeof AuthResult)[keyof typeof AuthResult], (typeof STATE)[keyof typeof STATE]>;
    const chunks = builder.build({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: 0,
      timestamp: 0,
      data: write_amf0(status, transaction_id, server, info),
    });
    for (const chunk of chunks) { connection.write(chunk); }

    return [next[authResult], next_context];
  },
  [STATE.WAITING_CREATESTREAM]: (message: Message, builder: MessageBuilder, connection: Duplex, auth: AuthConfiguration, context: RTMPContext) => {
    if (message.message_stream_id !== 0) { return [STATE.WAITING_CREATESTREAM, context]; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return [STATE.WAITING_CREATESTREAM, context]; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'createStream') { return [STATE.WAITING_CREATESTREAM, context]; }
    if (!isAMF0Number(command[1])) { return [STATE.WAITING_CREATESTREAM, context]; }
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

    return [STATE.WAITING_PUBLISH, context];
  },
  [STATE.WAITING_PUBLISH]: async (message: Message, builder: MessageBuilder, connection: Duplex, auth: AuthConfiguration, context: RTMPContext) => {
    if (message.message_stream_id !== PUBLISH_MESSAGE_STREAM) { return [STATE.WAITING_PUBLISH, context]; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return [STATE.WAITING_PUBLISH, context]; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'publish') { return [STATE.WAITING_PUBLISH, context]; }
    if (!isAMF0Number(command[1])) { return [STATE.WAITING_PUBLISH, context]; }
    const transaction_id = command[1];
    if (!isAMF0String(command[3])) { return [STATE.WAITING_PUBLISH, context]; }
    const streamKey = command[3];

    const [auth_before_lock, description_before_lock] = await auth.streamKey(streamKey);
    // streamKey が合致していて、配信されてない場合は配信を許可する
    const [authResult, description] = auth_before_lock === AuthResult.OK && lock.has(generate_key({ ... context, streamKey: strip_query(streamKey) })) ?  [AuthResult.DISCONNECT, null] : [auth_before_lock, description_before_lock];
    const publishAccepted = authResult === AuthResult.OK;

    const info = publishAccepted ? {
      code: 'NetStream.Publish.Start',
      description: description ?? 'Publish Accepted',
      level: 'status', // 正常系
    } : {
      code: 'NetStream.Publish.Failed', // Permision Denied
      description: description ?? 'Publish Failed',
      level: 'error', // 異常系
    };

    const next_context = publishAccepted ? { ... context, streamKey: strip_query(streamKey) } : context;
    if (publishAccepted) { lock.add(generate_key(next_context)); }

    const next = {
      [AuthResult.OK]: STATE.PUBLISHED,
      [AuthResult.RETRY]: STATE.WAITING_PUBLISH,
      [AuthResult.DISCONNECT]: STATE.DISCONNECTED,
    } as const satisfies Record<(typeof AuthResult)[keyof typeof AuthResult], (typeof STATE)[keyof typeof STATE]>;
    const chunks = builder.build({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: message.message_stream_id,
      timestamp: 0,
      data: write_amf0('onStatus', transaction_id, null, info),
    });
    for (const chunk of chunks) { connection.write(chunk); }

    return [next[authResult], next_context];
  },
  [STATE.PUBLISHED]: (message: Message, builder: MessageBuilder, connection: Duplex, auth: AuthConfiguration, context: RTMPContext) => {
    if (message.message_stream_id !== 0) { return [STATE.PUBLISHED, context]; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return [STATE.PUBLISHED, context]; }
    const command = read_amf0(message.data);

    const name = command[0];
    if (name !== 'deleteStream') { return [STATE.PUBLISHED, context]; }
    const stream = command[3];
    if (stream !== PUBLISH_MESSAGE_STREAM) { return [STATE.PUBLISHED, context]; }

    return [STATE.DISCONNECTED, context];
  },
  [STATE.DISCONNECTED]: (message: Message, builder: MessageBuilder, connection: Duplex, auth: AuthConfiguration, context: RTMPContext) => {
    return [STATE.DISCONNECTED, context];
  },
} as const satisfies Record<(typeof STATE)[keyof typeof STATE], (message: Message, builder: MessageBuilder, connection: Duplex, auth: AuthConfiguration, context: RTMPContext) => MaybePromise<[(typeof STATE)[keyof typeof STATE], RTMPContext]>>;

async function* handle_rtmp(connection: Duplex, auth: AuthConfiguration): AsyncIterable<Message> {
  const controller = new AbortController();
  using reader = new AsyncByteReader({ signal: controller.signal });
  const builder = new MessageBuilder();
  connection.pipe(new Writable({
    write(data, _, cb) { reader.feed(data); cb(); },
  }));

  let context = RTMPContext.from();
  try {
    /*
    * RTMPのハンドシェイクを処理する
    */
    if (!await handle_handshake(reader, connection)) { return; }
    /*
    * RTMPのメッセージを処理する
    */
    let state = STATE.WAITING_CONNECT as (typeof STATE)[keyof typeof STATE];
    for await (const message of read_message(reader)) {
      // 共通で処理するメッセージはここで処理する

      // 上位に伝える映像/音声/データのメッセージだったら伝える
      if (need_yield(state, message)) { yield message; }

      // 個別のメッセージによる状態遷移
      const transition = TRANSITION[state](message, builder, connection, auth, context);
      // メディアデータを読んでいる時に余計な microtask を作りたくないので判定して await する
      ([state, context] = transition instanceof Promise ? await transition : transition);
      if (state === STATE.DISCONNECTED) { return; }
    }
  } finally {
    connection.end();
    lock.delete(generate_key(context));
  }
}

export default async (connection: Duplex, auth: AuthConfiguration, output?: Writable): Promise<void> => {
  using writer = output != null ? new FLVWriter(output) : null;
  for await (const message of handle_rtmp(connection, auth)) {
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
