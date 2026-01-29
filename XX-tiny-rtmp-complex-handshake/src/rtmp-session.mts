import crypto, { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Duplex } from 'node:stream';
import { setTimeout } from 'node:timers/promises';

import AsyncByteReader from '../../01-tiny-rtmp-server/src/async-byte-reader.mts';
import read_message, { MessageType } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import read_amf0, { isAMF0Number, isAMF0Object, isAMF0String } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import write_amf0 from '../../01-tiny-rtmp-server/src/amf0-writer.mts';
import FLVWriter from '../../01-tiny-rtmp-server/src/flv-writer.mts';
import MessageBuilder from '../../01-tiny-rtmp-server/src/message-builder.mts';

const simple_handshake_C1S1C2S2 = async (c1: Buffer, reader: AsyncByteReader, connection: Duplex): Promise<boolean> => {
  // simple handshake
  const c1_random = c1.subarray(8);
  const s1_random = randomBytes(1536 - 8);
  const s1 = Buffer.concat([Buffer.alloc(8), s1_random]);
  connection.write(s1); // write S1

  const s2 = Buffer.concat([Buffer.alloc(8), c1_random]);
  connection.write(s2); // write S2
  const c2 = await reader.read(1536); // read C2
  const c2_random_echo = c2.subarray(8);

  return s1_random.equals(c2_random_echo);
};

const clientKey = Buffer.from('Genuine Adobe Flash Player 001', 'ascii');
const serverKey = Buffer.from('Genuine Adobe Flash Media Server 001', 'ascii');

const verifyC1 = (c1: Buffer, offset: number): boolean => {
  const c1_offset = (c1.readUint8(offset + 8) + c1.readUint8(offset + 9) + c1.readUint8(offset + 10)  + c1.readUint8(offset + 11)) % 728;
  const c1_digest_client = c1.subarray(offset + 12 + c1_offset, offset + 12 + c1_offset + 32);

  const hmac = crypto.createHmac('sha256', clientKey);
  const data = Buffer.concat([c1.subarray(0, offset + 12 + c1_offset), c1.subarray(offset + 12 + c1_offset + 32)]);
  hmac.update(data);
  const c1_digest_server = hmac.digest();

  return c1_digest_server.equals(c1_digest_client);
};

const handshake_C1S1C2S2 = async (reader: AsyncByteReader, connection: Duplex): Promise<boolean> => {
  const c1 = await reader.read(1536); // read C1
  const s1 = Buffer.concat([Buffer.alloc(8), randomBytes(1536 - 8)]);

  for (const offset of [0, 764]) { // Scheme 0 / Scheme 1
    if (!verifyC1(c1, offset)) { continue; }

    // version: 3
    s1[4] = 3;

    const hmac_s1 = crypto.createHmac('sha256', serverKey);
    const s1_offset = (s1.readUint8(offset + 8) + s1.readUint8(offset + 9) + s1.readUint8(offset + 10)  + s1.readUint8(offset + 11)) % 728;
    const data = Buffer.concat([s1.subarray(0, offset + 12 + s1_offset), s1.subarray(offset + 12 + s1_offset + 32)]);
    hmac_s1.update(data);
    const s1_digest_server = hmac_s1.digest();
    s1.set(s1_digest_server, offset + 12 + s1_offset);

    connection.write(s1); // write S1

    const c1_offset = (c1.readUint8(offset + 8) + c1.readUint8(offset + 9) + c1.readUint8(offset + 10)  + c1.readUint8(offset + 11)) % 728;
    const c1_digest_client = c1.subarray(offset + 12 + c1_offset, offset + 12 + c1_offset + 32);
    const s2_key_hmac = crypto.createHmac('sha256', Buffer.concat([serverKey, Buffer.from('F0EEC24A8068BEE82E00D0D1029E7E576EEC5D2D29806FAB93B8E636CFEB31AE', 'hex')]));
    s2_key_hmac.update(c1_digest_client);
    const s2_key = s2_key_hmac.digest();
    const s2 = randomBytes(1536);
    const s2_hmac = crypto.createHmac('sha256', s2_key);
    s2_hmac.update(s2.subarray(0, s2.byteLength - 32));
    s2.set(s2_hmac.digest(), s2.byteLength - 32);

    connection.write(s2); // write S2
    const c2 = await reader.read(1536); // read C2

    const c2_digest_client = c2.subarray(c2.byteLength - 32);
    const c2_key_hmac = crypto.createHmac('sha256', Buffer.concat([clientKey, Buffer.from('F0EEC24A8068BEE82E00D0D1029E7E576EEC5D2D29806FAB93B8E636CFEB31AE', 'hex')]));
    c2_key_hmac.update(s1_digest_server);
    const c2_key = c2_key_hmac.digest();
    const c2_hmac = crypto.createHmac('sha256', c2_key);
    c2_hmac.update(c2.subarray(0, c2.byteLength - 32));
    const c2_digest_server = c2_hmac.digest();

    if (c2_digest_server.equals(c2_digest_client)) {
      return true;
    } else {
      // 署名だけサポートしてない場合があるので、その場合はランダムエコーを検証する
      // FFmpeg の 内蔵 (librtmpではない方) の打ち上げでこのルートを通る (8.0.1 で確認)
      const s1_random = s1.subarray(8);
      const c2_random_echo = c2.subarray(8);
      return s1_random.equals(c2_random_echo);
    }
  }

  // version: 0
  return simple_handshake_C1S1C2S2(c1, reader, connection);
};

const handle_handshake = async (reader: AsyncByteReader, connection: Duplex): Promise<boolean> => {
  // C0/S0
  await reader.readU8(); // Read C0
  connection.write(Buffer.from([0x03])); // Write S0 (Version: 3)
  // C1/S1
  return handshake_C1S1C2S2(reader, connection);
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
    keepAliveFn: ((app: string, key: string) => (boolean | Promise<boolean>)) | null
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
    // abort 時に強制的に切断状態に移行する
    if (controller.signal.aborted) { state = STATE.DISCONNECTED; }
    controller.signal.addEventListener('abort', () => {
      state = STATE.DISCONNECTED;
    }, { once: true });
    // 配信セッションの定期的な生存確認
    (async () => {
      while (state !== STATE.DISCONNECTED) {
        await setTimeout(KEEPALIVE_INTERVAL);
        if (state !== STATE.PUBLISHED) { continue; }
        const keepAlive = await (async () => {
          try {
            // PUBLISHED なら app と streamKey は必ず存在する
            return auth.keepAlive(context.app!, context.streamKey!)
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
        const data = command.length === 3 && command[0] === '@setDataFrame' && command[1] === 'onMetaData' ? [command[1], command[2]] : command;
        writer?.write({ ... message, data: write_amf0(... data) });
        break;
      }
    }
  }
};
