import { randomBytes } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import type { Duplex } from 'node:stream';
import { setTimeout as wait } from 'node:timers/promises';
import { setTimeout } from 'node:timers';

import AsyncByteReader from './async-byte-reader.mts';
import read_message from './message-reader.mts';
import { MessageType, WindowAcknowledgementSize, SetPeerBandwidth, StreamBegin, Acknowledgement } from './message.mts';
import type { Message } from './message.mts';
import { isAMF0Number, isAMF0Object, isAMF0String } from './amf0-reader.mts';
import write_amf0 from './amf0-writer.mts';
import MessageWriter from './message-writer.mts';
import FLVWriter from './flv-writer.mts';
import { logger } from './logger.mts';
import { load, store, initialized } from './rtmp-session.mts';
import AckCounter from './ack-counter.mts';
import { AuthResult, collect_query, strip_query, type AuthConfiguration } from './auth.mts';

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
type MaybePromise<T,> = T | Promise<T>;
const TRANSITION = {
  [STATE.WAITING_CONNECT]: async (message: Message, writer: MessageWriter, auth: AuthConfiguration) => {
    if (message.message_stream_id !== 0) { return STATE.WAITING_CONNECT; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.WAITING_CONNECT; }
    const command = message.data;

    const name = command[0];
    if (name !== 'connect') { return STATE.WAITING_CONNECT; }
    if (!isAMF0Number(command[1])) { return STATE.WAITING_CONNECT; }
    const transaction_id = command[1];
    if (!isAMF0Object(command[2])) { return STATE.WAITING_CONNECT; }
    const app = command[2]['app'];
    if (!isAMF0String(app)) { return STATE.WAITING_CONNECT; }

    const [authResult, description] = await (() => {
      try {
        return auth.connect(strip_query(app), collect_query(app));
      } catch {
        // 認証で不測のエラーが起きた場合は切断する
        logger.error('Connect Auth Failed');
        return [AuthResult.DISCONNECT, null];
      }
    })();
    const connectAccepted = authResult === AuthResult.OK;

    // Connect を伝達する前に WindowAcknowledgementSize, SetPeerBandwidth, StreamBegin を伝達する
    writer.write(WindowAcknowledgementSize.from({ ack_window_size: WINDOW_ACKNOWLEDGE_SIZE, timestamp: 0 }));
    writer.write(SetPeerBandwidth.from({ ack_window_size: WINDOW_ACKNOWLEDGE_SIZE, limit_type: 2, timestamp: 0 }));
    writer.write(StreamBegin.from({ message_stream_id: 0, timestamp: 0 }));

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
    writer.write({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: 0,
      timestamp: 0,
      data: [status, transaction_id, server, info],
    });

    if (connectAccepted) {
      store({ app: strip_query(app) });
    }
    const next = {
      [AuthResult.OK]: STATE.WAITING_CREATESTREAM,
      [AuthResult.RETRY]: STATE.WAITING_CONNECT,
      [AuthResult.DISCONNECT]: STATE.DISCONNECTED,
    } as const satisfies Record<(typeof AuthResult)[keyof typeof AuthResult], (typeof STATE)[keyof typeof STATE]>;

    return next[authResult];
  },
  [STATE.WAITING_CREATESTREAM]: (message: Message, writer: MessageWriter, auth: AuthConfiguration) => {
    if (message.message_stream_id !== 0) { return STATE.WAITING_CREATESTREAM; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.WAITING_CREATESTREAM; }
    const command = message.data;

    const name = command[0];
    if (name !== 'createStream') { return STATE.WAITING_CREATESTREAM; }
    if (!isAMF0Number(command[1])) { return STATE.WAITING_CREATESTREAM; }
    const transaction_id = command[1];

    // CreateStream で作った Message Stream ID を返却する
    writer.write({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: 0,
      timestamp: 0,
      data: ['_result', transaction_id, null, PUBLISH_MESSAGE_STREAM],
    });

    return STATE.WAITING_PUBLISH;
  },
  [STATE.WAITING_PUBLISH]: async (message: Message, writer: MessageWriter, auth: AuthConfiguration) => {
    if (message.message_stream_id !== PUBLISH_MESSAGE_STREAM) { return STATE.WAITING_PUBLISH; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.WAITING_PUBLISH; }
    const command = message.data;

    const name = command[0];
    if (name !== 'publish') { return STATE.WAITING_PUBLISH; }
    if (!isAMF0Number(command[1])) { return STATE.WAITING_PUBLISH; }
    const transaction_id = command[1];
    if (!isAMF0String(command[3])) { return STATE.WAITING_PUBLISH; }
    const stream = command[3];

    const [authResult, description] = await (() => {
      try {
        return auth.publish(load()!.app!, strip_query(stream), collect_query(stream));
      } catch {
        // 認証で不測のエラーが起きた場合は切断する
        logger.error('Publish Auth Failed');
        return [AuthResult.DISCONNECT, null];
      }
    })();
    const publishAccepted = authResult === AuthResult.OK;

    if (publishAccepted) {
      // 利用開始する Message Stream ID を Stream Begin で伝達する
      writer.write(StreamBegin.from({ message_stream_id: PUBLISH_MESSAGE_STREAM, timestamp: 0 }));
    }

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
    writer.write({
      message_type_id: MessageType.CommandAMF0,
      message_stream_id: message.message_stream_id,
      timestamp: 0,
      data: ['onStatus', transaction_id, null, info],
    });

    if (publishAccepted) {
      store({ stream: strip_query(stream), query: collect_query(stream) });
    }

    const next = {
      [AuthResult.OK]: STATE.PUBLISHED,
      [AuthResult.RETRY]: STATE.WAITING_PUBLISH,
      [AuthResult.DISCONNECT]: STATE.DISCONNECTED,
    } as const satisfies Record<(typeof AuthResult)[keyof typeof AuthResult], (typeof STATE)[keyof typeof STATE]>;

    return next[authResult];
  },
  [STATE.PUBLISHED]: (message: Message, writer: MessageWriter, auth: AuthConfiguration) => {
    if (message.message_stream_id !== 0) { return STATE.PUBLISHED; }
    if (message.message_type_id !== MessageType.CommandAMF0) { return STATE.PUBLISHED; }
    const command = message.data;

    const name = command[0];
    if (name !== 'deleteStream') { return STATE.PUBLISHED; }
    const stream = command[3];
    if (stream !== PUBLISH_MESSAGE_STREAM) { return STATE.PUBLISHED; }

    return STATE.DISCONNECTED;
  },
  [STATE.DISCONNECTED]: (message: Message, writer: MessageWriter, auth: AuthConfiguration) => {
    return STATE.DISCONNECTED;
  },
} as const satisfies Record<(typeof STATE)[keyof typeof STATE], (message: Message, builder: MessageWriter, auth: AuthConfiguration) => MaybePromise<(typeof STATE)[keyof typeof STATE]>>;

const KEEPALIVE_INTERVAL = 10 * 1000; // MEMO: アプリケーション変数

async function* handle_rtmp(connection: Duplex, auth: AuthConfiguration): AsyncIterable<Message> {
  if (!initialized()) { throw new Error('RTMP session not initialized.'); }

  const controller = new AbortController();
  using writer = new MessageWriter({ signal: controller.signal });
  Readable.from(writer.retrieve()).pipe(connection);
  const counter = new AckCounter((bytes: number) => {
    // MEMO: システム系はあんま timestamp に意味ない? らしい...? ので 0 にしてる
    writer.write(Acknowledgement.from({ sequence_number: bytes, timestamp: 0 }));
  });
  using reader = new AsyncByteReader({ signal: controller.signal });
  connection.pipe(new Writable({
    write(data, _, cb) {
      reader.feed(data);
      counter.feed(data.byteLength);
      cb();
    },
  }));
  const disconnected = controller.abort.bind(controller);
  connection.addListener('close', disconnected);
  connection.addListener('error', disconnected);

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
    const keepalive_controller = new AbortController();
    (async () => {
      const signal = AbortSignal.any([controller.signal, keepalive_controller.signal]);
      while (state !== STATE.DISCONNECTED) {
        try {
          await wait(KEEPALIVE_INTERVAL, undefined, { signal });
        } catch {
          break;
        }
        if (state !== STATE.PUBLISHED) { continue; }
        const keepalive = await (() => {
          try {
            // PUBLISHED なら session 内であり app と stream は必ず存在する
            const session = load()!;
            return auth.keepalive(session.app!, session.stream!, session.query);
          } catch {
            // keepalive 自体が不測の事態で失敗した場合は可用性を優先して切断しない
            logger.error('Auth keepalive Failed');
            return AuthResult.OK;
          }
        })();
        if (keepalive === AuthResult.DISCONNECT) {
          controller.abort(new Error('keepalive check failed'));
          break;
        }
      }
    })();

    // メッセージループ
    try {
      for await (const message of read_message(reader)) {
        // 共通で処理するメッセージはここで処理する
        if (message.message_type_id === MessageType.WindowAcknowledgementSize) {
          counter.window(message.data.ack_window_size);
        }

        // 上位に伝える映像/音声/データのメッセージだったら伝える
        if (need_yield(state, message)) { yield message; }

        // 個別のメッセージによる状態遷移
        state = await TRANSITION[state](message, writer, auth);
        if (state === STATE.DISCONNECTED) { return; }
      }
    } finally {
      // ループが異常な理由で終了しても切断状態にする
      state = STATE.DISCONNECTED;
      keepalive_controller.abort();
    }
  } finally {
    writer.end();
    await writer.ended(); // 今の送信キューを flush して送信する
    connection.end();

    const session = load()!;
    if (session.app != null && session.stream != null) {
      await auth.disconnect(session.app, session.stream, session.query);
    }
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
        const command = message.data;
        const data = write_amf0(... command.length === 3 && command[0] === '@setDataFrame' && command[1] === 'onMetaData' ? [command[1], command[2]] : command);
        writer?.write({ ... message, data });
        break;
      }
    }
  }
};
