import { describe, expect, test, vi } from 'vitest';
import { Duplex, PassThrough, Writable } from 'node:stream';

import AsyncByteReader from '../src/async-byte-reader.mts';
import read_amf0 from '../src/amf0-reader.mts';
import write_amf0 from '../src/amf0-writer.mts';
import read_message from '../src/message-reader.mts';
import { MessageType, SetPeerBandwidth, StreamBegin, UserControlType, WindowAcknowledgementSize } from '../src/message.mts';
import MessageWriter from '../src/message-writer.mts';
import handle_rtmp, { AuthConfiguration } from '../src/rtmp-accepter.mts';
import { run } from '../src/rtmp-session.mts';

describe('Regression Test', () => {
  test('Publish Success', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const connection = Duplex.from({ readable: input, writable: output });
    using reader = new AsyncByteReader();
    output.on('data', (chunk) => { reader.feed(chunk); });
    using writer = new MessageWriter();
    (async () => {
      for await (const chunk of writer.retrieve()) {
        input.write(chunk);
      }
    })();

    const flv = new AsyncByteReader();
    run(() => {
      handle_rtmp(connection, AuthConfiguration.noAuth(), new Writable({
        write(chunk, _, cb) {
          flv.feed(chunk);
          cb();
        },
      }));
    });

    /*
     * Simple handshake
     */
    {
      // C0/S0
      input.write(Buffer.from([0x03]));
      const c1_random = Buffer.alloc(1536 - 8);
      const c1 = Buffer.concat([Buffer.alloc(8), c1_random]);
      input.write(c1);
      const s0 = await reader.read(1);
      expect(s0.equals(Buffer.from([0x03]))).toStrictEqual(true);
      // C1/S1
      const s1 = await reader.read(1536); // read S1
      const s1_random = s1.subarray(8);
      // C2/S2
      const c2 = Buffer.concat([Buffer.alloc(8), s1_random]);
      input.write(c2); // write S2
      const s2 = await reader.read(1536); // read C2
      const s2_random_echo = s2.subarray(8);
      expect(s2_random_echo.equals(c1_random)).toStrictEqual(true);
    }

    const gen = read_message(reader)[Symbol.asyncIterator]();
    /*
     * Messaging
     */
    // connect
    {
      const connect = write_amf0(
        'connect',
        1,
        {
          app: 'app',
          type: 'nonprivate',
          flashVer: 'FMLE/3.0 (compatible; Lavf61.7.100)',
          tcUrl: 'rtmp://localhost:1935/app',
        },
      );
      writer.write({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: connect,
      });

      expect((await gen.next()).value).toStrictEqual(
        {
          message_type_id: MessageType.WindowAcknowledgementSize,
          message_stream_id: 0,
          timestamp: 0,
          data: {
            ack_window_size: 2500000,
          },
        },
      );
      expect((await gen.next()).value).toStrictEqual(
        {
          message_type_id: MessageType.SetPeerBandwidth,
          message_stream_id: 0,
          timestamp: 0,
          data: {
            ack_window_size: 2500000,
            limit_type: 2,
          },
        },
      );
      expect((await gen.next()).value).toStrictEqual(
        {
          message_type_id: MessageType.UserControl,
          message_stream_id: 0,
          timestamp: 0,
          data: {
            event_type: UserControlType.StreamBegin,
            message_stream_id: 0,
          },
        },
      );

      const data = read_amf0((await gen.next()).value.data);
      const expected = [
        '_result',
        1,
        { fmsVer: 'FMS/3,5,7,7009', capabilities: 31, mode: 1 },
        {
          level: 'status',
          code: 'NetConnection.Connect.Success',
          description: 'Connection succeeded.',
          data: { version: '3,5,7,7009' },
          objectEncoding: 0,
        },
      ];
      expect(data).toStrictEqual(expected);
    }
    // createStream
    {
      const connect = write_amf0(
        'createStream',
        4,
        null,
      );
      writer.write({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: connect,
      });

      expect((await gen.next()).value).toStrictEqual(
        {
          message_type_id: MessageType.UserControl,
          message_stream_id: 0,
          timestamp: 0,
          data: {
            event_type: UserControlType.StreamBegin,
            message_stream_id: 1,
          },
        },
      );

      const data = read_amf0((await gen.next()).value.data);
      const expected = [
        '_result',
        4,
        null,
        1,
      ];
      expect(data).toStrictEqual(expected);
    }
    // publish
    {
      const connect = write_amf0(
        'publish',
        5,
        null,
        'key',
        'live',
      );
      writer.write({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 1,
        timestamp: 0,
        data: connect,
      });
      const data = read_amf0((await gen.next()).value.data);
      const expected = [
        'onStatus',
        5,
        null,
        {
          code: 'NetStream.Publish.Start',
          description: 'Publish Accepted',
          level: 'status',
        },
      ];
      expect(data).toStrictEqual(expected);
    }
    // send data
    {
      writer.write({
        message_type_id: MessageType.Video,
        message_stream_id: 1,
        timestamp: 123456789,
        data: Buffer.from('test', 'ascii'),
      });

      // header
      expect((await flv.read(3)).equals(Buffer.from([0x46, 0x4C, 0x56]))).toStrictEqual(true);
      expect((await flv.readU8())).toStrictEqual(0x01);
      expect((await flv.readU8())).toStrictEqual(0x05);
      expect((await flv.readU32BE())).toStrictEqual(9);
      expect((await flv.readU32BE())).toStrictEqual(0);
      // tag
      expect((await flv.readU8())).toStrictEqual(MessageType.Video);
      expect((await flv.readU24BE())).toStrictEqual(4);
      expect((await flv.readU24BE())).toStrictEqual(Math.floor(123456789 / 2 ** 0) % 2 ** 24);
      expect((await flv.readU8())).toStrictEqual(Math.floor(123456789 / 2 ** 24) % 2 ** 8);
      expect((await flv.readU24BE())).toStrictEqual(0);
      expect((await flv.read(4)).equals(Buffer.from('test', 'ascii'))).toStrictEqual(true);
      expect((await flv.readU32BE())).toStrictEqual(4 + 11);
    }
  });
});
