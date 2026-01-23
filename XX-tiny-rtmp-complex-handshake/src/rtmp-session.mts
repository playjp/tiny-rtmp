import crypto, { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Duplex } from 'node:stream';

import AsyncByteReader from '../../01-tiny-rtmp-server/src/async-byte-reader.mts';
import read_message, { MessageType } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import read_amf0, { isAMF0Number, isAMF0Object, isAMF0String } from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import write_amf0 from '../../01-tiny-rtmp-server/src/amf0-writer.mts';
import FLVWriter from '../../01-tiny-rtmp-server/src/flv-writer.mts';
import MessageBuilder from '../../01-tiny-rtmp-server/src/message-builder.mts';

const STATE = {
  WAITING_CONNECT: 'WAITING_CONNECT',
  WAITING_CREATESTREAM: 'WAITING_CREATESTREAM',
  WAITING_PUBLISH: 'WAITING_PUBLISH',
  PUBLISHED: 'PUBLISHED',
} as const;

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
  const s1_random = randomBytes(1536 - 8);
  const s1 = Buffer.concat([Buffer.alloc(8), s1_random]);

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
      // 署名だけサポートしてない場合がある(らしい)ので、その場合はランダムエコーを検証するが、これはいるのか疑問
      const c2_random_echo = c2.subarray(8);
      return s1_random.equals(c2_random_echo);
    }
  }

  // version: 0
  return simple_handshake_C1S1C2S2(c1, reader, connection);
};


export default async (connection: Duplex, output?: Writable) => {
  using reader = new AsyncByteReader();
  connection.pipe(new Writable({
    write(data, _, cb) { reader.feed(data); cb(); },
    destroy(err, cb) { reader.feedEOF(); cb(err); },
  }));
  using writer = output != null ? new FLVWriter(output) : null;
  const builder = new MessageBuilder();

  try {
    /*
    * RTMPのハンドシェイクを処理する
    */
    {
      // C0/S0
      await reader.readU8(); // Read C0
      connection.write(Buffer.from([0x03])); // Write S0 (Version: 3)
      // C1/S1
      if (await !handshake_C1S1C2S2(reader, connection)) {
        throw new Error('Handshake Failure');
      }
    }
    /*
    * RTMPのメッセージを処理する
    */
    let state: (typeof STATE)[keyof typeof STATE] = STATE.WAITING_CONNECT;
    for await (const message of read_message(reader)) {
      // 本当は共通で処理するシステムメッセージ部分を書く、大体の打ち上げRTMPではなくても良いので省略

      switch (state) {
        case STATE.WAITING_CONNECT: {
          if (message.message_stream_id !== 0) { continue; }
          if (message.message_type_id !== MessageType.CommandAMF0) { continue; }
          const command = read_amf0(message.data);

          const name = command[0];
          if (name !== 'connect') { continue; }
          if (!isAMF0Number(command[1])) { continue; }
          const transaction_id = command[1];
          if (!isAMF0Object(command[2])) { continue; }
          const appName = command[2]['app'];
          if (!isAMF0String(appName)) { continue; }

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

          state = STATE.WAITING_CREATESTREAM;
          break;
        }
        case STATE.WAITING_CREATESTREAM: {
          if (message.message_stream_id !== 0) { continue; }
          if (message.message_type_id !== MessageType.CommandAMF0) { continue; }
          const command = read_amf0(message.data);

          const name = command[0];
          if (name !== 'createStream') { continue; }
          if (!isAMF0Number(command[1])) { continue; }
          const transaction_id = command[1];

          // message_stream_id は 0 が予約されている (今使ってる) ので 1 を利用する
          const result = write_amf0('_result', transaction_id, null, 1);
          const chunks = builder.build({
            message_type_id: MessageType.CommandAMF0,
            message_stream_id: 0,
            timestamp: 0,
            data: result,
          });
          for (const chunk of chunks) { connection.write(chunk); }

          state = STATE.WAITING_PUBLISH;
          break;
        }
        case STATE.WAITING_PUBLISH: {
          if (message.message_stream_id !== 1) { continue; }
          if (message.message_type_id !== MessageType.CommandAMF0) { continue; }
          const command = read_amf0(message.data);

          const name = command[0];
          if (name !== 'publish') { continue; }
          if (!isAMF0Number(command[1])) { continue; }
          const transaction_id = command[1];
          if (!isAMF0String(command[3])) { continue; }
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

          state = STATE.PUBLISHED;
          break;
        }
        case STATE.PUBLISHED: {
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
          break;
        }
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    connection.destroy();
  }
};
