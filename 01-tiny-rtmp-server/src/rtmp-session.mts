import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import type { Duplex } from 'node:stream';

import AsyncByteReader from './async-byte-reader.mts';
import read_message, { MessageType } from './message-reader.mts';
import read_amf0, { isAMF0Number, isAMF0Object, isAMF0String } from './amf0-reader.mts';
import write_amf0 from './amf0-writer.mts';
import FLVWriter from './flv-writer.mts';
import MessageBuilder from './message-builder.mts';

const STATE = {
  WAITING_CONNECT: 'WAITING_CONNECT',
  WAITING_CREATESTREAM: 'WAITING_CREATESTREAM',
  WAITING_PUBLISH: 'WAITING_PUBLISH',
  PUBLISHED: 'PUBLISHED',
} as const;

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
      if (!s1_random.equals(c2_random_echo)) {
        throw new Error('Invalid Random Echo');
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
          console.error(`appName: ${appName}`);

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
          connection.write(builder.build({
            message_type_id: MessageType.CommandAMF0,
            message_stream_id: 0,
            timestamp: 0,
            data: result,
          }));

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
          connection.write(builder.build({
            message_type_id: MessageType.CommandAMF0,
            message_stream_id: 0,
            timestamp: 0,
            data: result,
          }));

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
          console.error(`streamKey: ${streamKey}`);

          const info = {
            code: 'NetStream.Publish.Start',
            description: 'Publish Accepted',
            level: 'status', // 正常系
          };
          const result = write_amf0('onStatus', transaction_id, null, info);
          connection.write(builder.build({
            message_type_id: MessageType.CommandAMF0,
            message_stream_id: message.message_stream_id,
            timestamp: 0,
            data: result,
          }));

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
