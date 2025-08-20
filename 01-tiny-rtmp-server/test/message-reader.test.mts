import { describe, expect, test } from 'vitest';

import AsyncByteReader from '../src/async-byte-reader.mts';
import read_message from '../src/message-reader.mts';
import read_amf0 from '../src/amf0-reader.mts';

describe('Regression Test', () => {
  test('Messaging (FFmpeg)', async () => {
    const reader = new AsyncByteReader();
    const gen = read_message(reader)[Symbol.asyncIterator]();

    // connect
    reader.feed(Buffer.from('03000000000088140000000002000763', 'hex'));
    reader.feed(Buffer.from('6f6e6e656374003ff000000000000003', 'hex'));
    reader.feed(Buffer.from('00036170700200036170700004747970', 'hex'));
    reader.feed(Buffer.from('6502000a6e6f6e707269766174650008', 'hex'));
    reader.feed(Buffer.from('666c617368566572020023464d4c452f', 'hex'));
    reader.feed(Buffer.from('332e302028636f6d70617469626c653b', 'hex'));
    reader.feed(Buffer.from('204c61766636312e372e313030290005', 'hex'));
    reader.feed(Buffer.from('746355726c02001972746d703a2f2f6c', 'hex'));
    reader.feed(Buffer.from('6f63616c686f73743a313933c3352f61', 'hex'));
    reader.feed(Buffer.from('7070000009', 'hex'));

    // releaseStream
    reader.feed(Buffer.from('4300000000002014', 'hex'));
    reader.feed(Buffer.from('02000d72656c6561736553747265616d', 'hex'));
    reader.feed(Buffer.from('004000000000000000050200036b6579', 'hex'));

    // FCPublish
    reader.feed(Buffer.from('4300000000001c140200094643507562', 'hex'));
    reader.feed(Buffer.from('6c697368004008000000000000050200', 'hex'));
    reader.feed(Buffer.from('036b6579', 'hex'));

    // createStream
    reader.feed(Buffer.from('430000000000191402000c63', 'hex'));
    reader.feed(Buffer.from('726561746553747265616d0040100000', 'hex'));
    reader.feed(Buffer.from('0000000005', 'hex'));

    // publish
    reader.feed(Buffer.from('080000000000211401000000', 'hex'));
    reader.feed(Buffer.from('0200077075626c697368004014000000', 'hex'));
    reader.feed(Buffer.from('000000050200036b65790200046c6976', 'hex'));
    reader.feed(Buffer.from('65', 'hex'));

    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(0);
      expect(message.message_length).toStrictEqual(136);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'connect',
        1,
        {
          app: 'app',
          flashVer: 'FMLE/3.0 (compatible; Lavf61.7.100)',
          tcUrl: 'rtmp://localhost:1935/app',
          type: 'nonprivate',
        },
      ]);
    }
    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(0);
      expect(message.message_length).toStrictEqual(32);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'releaseStream',
        2,
        null,
        'key',
      ]);
    }
    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(0);
      expect(message.message_length).toStrictEqual(28);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'FCPublish',
        3,
        null,
        'key',
      ]);
    }
    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(0);
      expect(message.message_length).toStrictEqual(25);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'createStream',
        4,
        null,
      ]);
    }
    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(1);
      expect(message.message_length).toStrictEqual(33);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'publish',
        5,
        null,
        'key',
        'live',
      ]);
    }
  });

  test('Messaging (OBS)', async () => {
    const reader = new AsyncByteReader();
    const gen = read_message(reader)[Symbol.asyncIterator]();

    // SetChunkSize
    reader.feed(Buffer.from('02000000000004010000000000001000', 'hex'));

    // connect
    reader.feed(Buffer.from('030000000000a8140000000002000763', 'hex'));
    reader.feed(Buffer.from('6f6e6e656374003ff000000000000003', 'hex'));
    reader.feed(Buffer.from('00036170700200036170700004747970', 'hex'));
    reader.feed(Buffer.from('6502000a6e6f6e707269766174650008', 'hex'));
    reader.feed(Buffer.from('666c61736856657202001f464d4c452f', 'hex'));
    reader.feed(Buffer.from('332e302028636f6d70617469626c653b', 'hex'));
    reader.feed(Buffer.from('20464d53632f312e3029000673776655', 'hex'));
    reader.feed(Buffer.from('726c02001972746d703a2f2f6c6f6361', 'hex'));
    reader.feed(Buffer.from('6c686f73743a313933352f6170700005', 'hex'));
    reader.feed(Buffer.from('746355726c02001972746d703a2f2f6c', 'hex'));
    reader.feed(Buffer.from('6f63616c686f73743a313933352f6170', 'hex'));
    reader.feed(Buffer.from('70000009', 'hex'));

    // releaseStream
    reader.feed(Buffer.from('430000000000201402000d72656c6561', 'hex'));
    reader.feed(Buffer.from('736553747265616d0040000000000000', 'hex'));
    reader.feed(Buffer.from('00050200036b6579', 'hex'));

    // FCPublish
    reader.feed(Buffer.from('4300000000001c140200094643507562', 'hex'));
    reader.feed(Buffer.from('6c697368004008000000000000050200', 'hex'));

    // createStream
    reader.feed(Buffer.from('036b6579430000000000191402000c63', 'hex'));
    reader.feed(Buffer.from('726561746553747265616d0040100000', 'hex'));
    reader.feed(Buffer.from('0000000005', 'hex'));

    // publish
    reader.feed(Buffer.from('04000000000021140100000002000770', 'hex'));
    reader.feed(Buffer.from('75626c69736800401400000000000005', 'hex'));
    reader.feed(Buffer.from('0200036b65790200046c697665', 'hex'));

    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(0);
      expect(message.message_length).toStrictEqual(168);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'connect',
        1,
        {
          app: 'app',
          flashVer: 'FMLE/3.0 (compatible; FMSc/1.0)',
          swfUrl: 'rtmp://localhost:1935/app',
          tcUrl: 'rtmp://localhost:1935/app',
          type: 'nonprivate',
        },
      ]);
    }
    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(0);
      expect(message.message_length).toStrictEqual(32);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'releaseStream',
        2,
        null,
        'key',
      ]);
    }
    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(0);
      expect(message.message_length).toStrictEqual(28);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'FCPublish',
        3,
        null,
        'key',
      ]);
    }
    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(0);
      expect(message.message_length).toStrictEqual(25);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'createStream',
        4,
        null,
      ]);
    }
    {
      const message = (await gen.next()).value;
      expect(message.message_type_id).toStrictEqual(20);
      expect(message.message_stream_id).toStrictEqual(1);
      expect(message.message_length).toStrictEqual(33);
      expect(message.timestamp).toStrictEqual(0);
      expect(read_amf0(message.data)).toStrictEqual([
        'publish',
        5,
        null,
        'key',
        'live',
      ]);
    }
  });
});
