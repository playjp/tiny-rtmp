import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Duplex } from 'node:stream';
import { setTimeout } from 'node:timers/promises';

import AsyncByteReader from './async-byte-reader.mts';
import read_message from './message-reader.mts';
import { MessageType, WindowAcknowledgementSize, SetPeerBandwidth, StreamBegin } from './message.mts';
import { Message } from './message.mts';
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
const collect_query = (value: string): Record<string, string | undefined> | undefined => {
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
  }, {}) as Record<string, string | undefined>;
};
type MaybePromise<T> = T | Promise<T>;
export type AuthResultWithDescription = [authResult: (typeof AuthResult)[keyof typeof AuthResult], description: string | null];
export interface AuthConfiguration {
  app(app: string): MaybePromise<AuthResultWithDescription>;
  streamKey(key: string): MaybePromise<AuthResultWithDescription>;
  keepAlive(app: string, key: string): MaybePromise<typeof AuthResult.OK | typeof AuthResult.DISCONNECT>;
};
export const AuthConfiguration = {
  noAuth(): AuthConfiguration {
    return {
      app: () => [AuthResult.OK, null],
      streamKey: () => [AuthResult.OK, null],
      keepAlive: () => AuthResult.OK,
    };
  },
  simpleAuth(appName: string, streamKey: string): AuthConfiguration {
    return {
      app: (app: string) => [strip_query(app) === appName ? AuthResult.OK : AuthResult.DISCONNECT, null],
      streamKey: (key: string) => [strip_query(key) === streamKey ? AuthResult.OK : AuthResult.DISCONNECT, null],
      keepAlive: () => AuthResult.OK,
    };
  },
  customAuth(
    appFn: ((app: string, query?: Record<string, string | undefined>) => (boolean | Promise<boolean>)) | null,
    streamKeyFn: ((key: string, query?: Record<string, string | undefined>) => (boolean | Promise<boolean>)) | null,
    keepAliveFn: ((app: string, key: string) => (boolean | Promise<boolean>)) | null,
  ): AuthConfiguration {
    return {
      app: async (app: string) => [(await (appFn?.(strip_query(app), collect_query(app))) ?? true) ? AuthResult.OK : AuthResult.DISCONNECT, null],
      streamKey: async (key: string) => [(await (streamKeyFn?.(strip_query(key), collect_query(key))) ?? true) ? AuthResult.OK : AuthResult.DISCONNECT, null],
      keepAlive: async (app: string, key: string) => (await (keepAliveFn?.(app, key)) ?? true) ? AuthResult.OK : AuthResult.DISCONNECT,
    };
  },
};
const KEEPALIVE_INTERVAL = 10 * 1000; // MEMO: アプリケーション変数

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
const WINDOW_ACKNOWLEDGE_SIZE = 2500000;
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

    const [authResult, description] = await (() => {
      try {
        return auth.app(app);
      } catch {
        // 認証で不測のエラーが起きた場合は切断する
        // FIXME: ここはログが欲しい
        return [AuthResult.DISCONNECT, null];
      }
    })();
    const connectAccepted = authResult === AuthResult.OK;

    // Connect を伝達する前に WindowAcknowledgementSize, SetPeerBandwidth, StreamBegin を伝達する
    {
      const chunks = builder.build(WindowAcknowledgementSize.into({ ack_window_size: WINDOW_ACKNOWLEDGE_SIZE, timestamp: 0 }));
      for (const chunk of chunks) { connection.write(chunk); }
    }
    {
      const chunks = builder.build(SetPeerBandwidth.into({ ack_window_size: WINDOW_ACKNOWLEDGE_SIZE, limit_type: 2, timestamp: 0 }));
      for (const chunk of chunks) { connection.write(chunk); }
    }
    {
      const chunks = builder.build(StreamBegin.into({ message_stream_id: 0, timestamp: 0 }));
      for (const chunk of chunks) { connection.write(chunk); }
    }

    const status = connectAccepted ? '_result' : '_error';
    const server = connectAccepted ? {
      fmsVer: 'FMS/3,5,7,7009',
      capabilities: 31,
      mode: 1,
    } : null;
    // Connect のレスポンスが level -> code の順じゃないと FMLE 3.2 は落ちてしまう
    const info = connectAccepted ? {
      level: 'status', // 正常系
      code: 'NetConnection.Connect.Success',
      description: description ?? 'Connection succeeded.',
      data: { version: '3,5,7,7009' },
      objectEncoding: 0, // 0 = AMF0, 3 = AMF3
    } : {
      level: 'error', // 異常系
      code: 'NetConnection.Connect.Rejected',
      description: description ?? 'Connection rejected.',
    };

    // connect のレスポンス
    {
      const chunks = builder.build({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: write_amf0(status, transaction_id, server, info),
      });
      for (const chunk of chunks) { connection.write(chunk); }
    }

    const next_context = connectAccepted ? { ... context, app: strip_query(app) } : context;
    const next = {
      [AuthResult.OK]: STATE.WAITING_CREATESTREAM,
      [AuthResult.RETRY]: STATE.WAITING_CONNECT,
      [AuthResult.DISCONNECT]: STATE.DISCONNECTED,
    } as const satisfies Record<(typeof AuthResult)[keyof typeof AuthResult], (typeof STATE)[keyof typeof STATE]>;

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

    // 利用開始する Message Stream ID を Stream Begin で伝達する
    {
      const chunks = builder.build(StreamBegin.into({ message_stream_id: PUBLISH_MESSAGE_STREAM, timestamp: 0 }));
      for (const chunk of chunks) { connection.write(chunk); }
    }
    // CreateStream で作った Message Stream ID を返却する
    {
      const result = write_amf0('_result', transaction_id, null, PUBLISH_MESSAGE_STREAM);
      const chunks = builder.build({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: result,
      });
      for (const chunk of chunks) { connection.write(chunk); }
    }

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

    const [auth_before_lock, description_before_lock] = await (() => {
      try {
        return auth.streamKey(streamKey);
      } catch {
        // 認証で不測のエラーが起きた場合は切断する
        // FIXME: ここはログが欲しい
        return [AuthResult.DISCONNECT, null];
      }
    })();
    // streamKey が合致していて、配信されてない場合は配信を許可する
    const [authResult, description] = auth_before_lock === AuthResult.OK && lock.has(generate_key({ ... context, streamKey: strip_query(streamKey) })) ?  [AuthResult.DISCONNECT, null] : [auth_before_lock, description_before_lock];
    const publishAccepted = authResult === AuthResult.OK;

    const info = publishAccepted ? {
      level: 'status', // 正常系
      code: 'NetStream.Publish.Start',
      description: description ?? 'Publish Accepted',
    } : {
      level: 'error', // 異常系
      code: 'NetStream.Publish.Failed', // Permision Denied
      description: description ?? 'Publish Failed',
    };

    // Publish のレスポンスを返す
    {
      const chunks = builder.build({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: message.message_stream_id,
        timestamp: 0,
        data: write_amf0('onStatus', transaction_id, null, info),
      });
      for (const chunk of chunks) { connection.write(chunk); }
    }

    const next_context = publishAccepted ? { ... context, streamKey: strip_query(streamKey) } : context;
    if (publishAccepted) { lock.add(generate_key(next_context)); }

    const next = {
      [AuthResult.OK]: STATE.PUBLISHED,
      [AuthResult.RETRY]: STATE.WAITING_PUBLISH,
      [AuthResult.DISCONNECT]: STATE.DISCONNECTED,
    } as const satisfies Record<(typeof AuthResult)[keyof typeof AuthResult], (typeof STATE)[keyof typeof STATE]>;

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

    // abort 時に強制的に切断状態に移行する
    if (controller.signal.aborted) {
      state = STATE.DISCONNECTED;
      return;
    }
    controller.signal.addEventListener('abort', () => {
      state = STATE.DISCONNECTED;
    }, { once: true });
    // 配信セッションの定期的な生存確認
    (async () => {
      while (state !== STATE.DISCONNECTED) {
        await setTimeout(KEEPALIVE_INTERVAL);
        if (state !== STATE.PUBLISHED) { continue; }
        const keepAlive = await (() => {
          try {
            // PUBLISHED なら app と streamKey は必ず存在する
            return auth.keepAlive(context.app!, context.streamKey!);
          } catch {
            // keepAlive 自体が不測の事態で失敗した場合は可用性を優先して切断しない
            // FIXME: ここはログが欲しい
            return AuthResult.OK;
          }
        })();
        if (keepAlive === AuthResult.DISCONNECT) {
          controller.abort(new Error('keepAlive check failed'));
          break;
        }
      }
    })();

    // メッセージループ
    try {
      for await (const message of read_message(reader)) {
        // 共通で処理するメッセージはここで処理する

        // 上位に伝える映像/音声/データのメッセージだったら伝える
        if (need_yield(state, message)) { yield message; }

        // 個別のメッセージによる状態遷移
        [state, context] = await TRANSITION[state](message, builder, connection, auth, context);
        if (state === STATE.DISCONNECTED) { return; }
      }
    } finally {
      // ループが異常な理由で終了しても切断状態にする
      state = STATE.DISCONNECTED;
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
        const data = write_amf0(... command.length === 3 && command[0] === '@setDataFrame' && command[1] === 'onMetaData' ? [command[1], command[2]] : command);
        writer?.write({ ... message, data });
        break;
      }
    }
  }
};
