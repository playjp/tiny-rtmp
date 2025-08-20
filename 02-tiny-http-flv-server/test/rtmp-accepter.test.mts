import { describe, expect, test, vi } from 'vitest';
import { Duplex, PassThrough } from 'stream';

import AsyncByteReader from '../../01-tiny-rtmp-server/src/async-byte-reader.mts';
import read_amf0 from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import write_amf0 from '../../01-tiny-rtmp-server/src/amf0-writer.mts';
import read_message, { MessageType } from '../../01-tiny-rtmp-server/src/message-reader.mts';
import write_message from '../../01-tiny-rtmp-server/src/message-writer.mts';

const handle_rtmp_import = async () => {
  vi.resetModules(); // 内部のモジュール変数に依存するため、毎回キャッシュを破棄する
  return (await import('../src/rtmp-accepter.mts')).default;
};

describe('Regression Test', () => {
  test('Publish Success', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const connection = Duplex.from({ readable: input, writable: output });
    using reader = new AsyncByteReader();
    output.on('data', (chunk) => { reader.feed(chunk); });

    const handle_rtmp = await handle_rtmp_import();
    const handler = handle_rtmp(connection, 'app', 'key');
    // do background
    (async () => { for await (const _ of handler) {} })();

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
      input.write(write_message({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: connect,
      }));
      const data = read_amf0((await gen.next()).value.data);
      const expected = [
        '_result',
        1,
        { fmsVer: 'FMS/3,5,7,7009', capabilities: 31, mode: 1 },
        {
          code: 'NetConnection.Connect.Success',
          description: 'Connection succeeded.',
          data: { version: '3,5,7,7009' },
          objectEncoding: 0,
          level: 'status',
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
      input.write(write_message({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: connect,
      }));
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
      input.write(write_message({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 1,
        timestamp: 0,
        data: connect,
      }));
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
  });

  test('Lock StreamKey', async () => {
    const handle_rtmp = await handle_rtmp_import();

    // Connection 1
    const input_1 = new PassThrough();
    const output_1 = new PassThrough();
    const connection_1 = Duplex.from({ readable: input_1, writable: output_1 });
    using reader_1 = new AsyncByteReader();
    output_1.on('data', (chunk) => { reader_1.feed(chunk); });

    const handler_1 = handle_rtmp(connection_1, 'app', 'key');
    (async () => { for await (const _ of handler_1) {} })(); // do background

    // Connection 2
    const input_2 = new PassThrough();
    const output_2 = new PassThrough();
    const connection_2 = Duplex.from({ readable: input_2, writable: output_2 });
    using reader_2 = new AsyncByteReader();
    output_2.on('data', (chunk) => { reader_2.feed(chunk); });

    const handler_2 = handle_rtmp(connection_2, 'app', 'key');
    (async () => { for await (const _ of handler_2) {} })(); // do background

    const inout = [[input_1, reader_1], [input_2, reader_2]] as [PassThrough, AsyncByteReader][];

    for (let i = 0; i < inout.length; i++) {
      const [input, reader] = inout[i];
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
        input.write(write_message({
          message_type_id: MessageType.CommandAMF0,
          message_stream_id: 0,
          timestamp: 0,
          data: connect,
        }));
        const data = read_amf0((await gen.next()).value.data);
        const expected = [
          '_result',
          1,
          { fmsVer: 'FMS/3,5,7,7009', capabilities: 31, mode: 1 },
          {
            code: 'NetConnection.Connect.Success',
            description: 'Connection succeeded.',
            data: { version: '3,5,7,7009' },
            objectEncoding: 0,
            level: 'status',
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
        input.write(write_message({
          message_type_id: MessageType.CommandAMF0,
          message_stream_id: 0,
          timestamp: 0,
          data: connect,
        }));
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
        input.write(write_message({
          message_type_id: MessageType.CommandAMF0,
          message_stream_id: 1,
          timestamp: 0,
          data: connect,
        }));
        const data = read_amf0((await gen.next()).value.data);
        const expected = [
          'onStatus',
          5,
          null,
          i === 0 ? {
            code: 'NetStream.Publish.Start',
            description: 'Publish Accepted',
            level: 'status',
          } : {
            code: 'NetStream.Publish.Failed',
            description: 'Publish Failed',
            level: 'error',
          },
        ];
        expect(data).toStrictEqual(expected);
      }
    }
  });

  test('Publish Failed (Invalid StreamKey)', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const connection = Duplex.from({ readable: input, writable: output });
    using reader = new AsyncByteReader();
    output.on('data', (chunk) => { reader.feed(chunk); });

    const handle_rtmp = await handle_rtmp_import();
    const handler = handle_rtmp(connection, 'app', 'key');
    // do background
    (async () => { for await (const _ of handler) {} })();

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
      input.write(write_message({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: connect,
      }));
      const data = read_amf0((await gen.next()).value.data);
      const expected = [
        '_result',
        1,
        { fmsVer: 'FMS/3,5,7,7009', capabilities: 31, mode: 1 },
        {
          code: 'NetConnection.Connect.Success',
          description: 'Connection succeeded.',
          data: { version: '3,5,7,7009' },
          objectEncoding: 0,
          level: 'status',
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
      input.write(write_message({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: connect,
      }));
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
        'inavlid',
        'live',
      );
      input.write(write_message({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 1,
        timestamp: 0,
        data: connect,
      }));
      const data = read_amf0((await gen.next()).value.data);
      const expected = [
        'onStatus',
        5,
        null,
        {
          code: 'NetStream.Publish.Failed',
          description: 'Publish Failed',
          level: 'error',
        },
      ];
      expect(data).toStrictEqual(expected);
    }
  });

  test('Connect Rejected (Invalid AppName)', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const connection = Duplex.from({ readable: input, writable: output });
    const reader = new AsyncByteReader();
    output.on('data', (chunk) => { reader.feed(chunk); });

    const handle_rtmp = await handle_rtmp_import();
    const handler = handle_rtmp(connection, 'app', 'key');
    // do background
    (async () => { for await (const _ of handler) {} })();

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
          app: 'invalid',
          type: 'nonprivate',
          flashVer: 'FMLE/3.0 (compatible; Lavf61.7.100)',
          tcUrl: 'rtmp://localhost:1935/app',
        },
      );
      input.write(write_message({
        message_type_id: MessageType.CommandAMF0,
        message_stream_id: 0,
        timestamp: 0,
        data: connect,
      }));
      const data = read_amf0((await gen.next()).value.data);
      const expected = [
        '_result',
        1,
        { fmsVer: 'FMS/3,5,7,7009', capabilities: 31, mode: 1 },
        {
          code: 'NetConnection.Connect.Rejected',
          description: 'Connection rejected.',
          level: 'error',
        },
      ];
      expect(data).toStrictEqual(expected);
    }
  });
});
