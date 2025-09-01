import { describe, expect, test } from 'vitest';
import { Writable } from 'stream';
import FLWWriter from '../src/flv-writer.mts';
import AsyncByteReader from '../src/async-byte-reader.mts';
import { MessageType } from '../src/message-reader.mts';
import write_amf0 from '../src/amf0-writer.mts';

describe('Unit Test', () => {
  test('Write FLV Header not write in non related data writed', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    writer.write({
      timestamp: 0,
      message_type_id: MessageType.Abort,
      message_stream_id: 1,
      message_length: 0,
      data: Buffer.from([]),
    });

    let resolved = false;
    reader.read(1).then(() => { resolved = true; });
    // wait MacroTask
    await new Promise(resolve => { setImmediate(resolve); });

    expect(resolved).toStrictEqual(false);
  });

  test('Write FLV Header in Video Data writed', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    writer.write({
      timestamp: 0,
      message_type_id: MessageType.Video,
      message_stream_id: 1,
      message_length: 0,
      data: Buffer.from([]),
    });

    expect((await reader.read(3)).equals(Buffer.from([0x46, 0x4C, 0x56]))).toStrictEqual(true);
    expect((await reader.readU8())).toStrictEqual(0x01);
    expect((await reader.readU8())).toStrictEqual(0x05);
    expect((await reader.readU32BE())).toStrictEqual(9);
    expect((await reader.readU32BE())).toStrictEqual(0);
  });

  test('Write FLV Header in Audio Data writed', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    writer.write({
      timestamp: 0,
      message_type_id: MessageType.Audio,
      message_stream_id: 1,
      message_length: 0,
      data: Buffer.from([]),
    });

    expect((await reader.read(3)).equals(Buffer.from([0x46, 0x4C, 0x56]))).toStrictEqual(true);
    expect((await reader.readU8())).toStrictEqual(0x01);
    expect((await reader.readU8())).toStrictEqual(0x05);
    expect((await reader.readU32BE())).toStrictEqual(9);
    expect((await reader.readU32BE())).toStrictEqual(0);
  });

  test('Write FLV Header in AMF0 Data writed', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    writer.write({
      timestamp: 0,
      message_type_id: MessageType.DataAMF0,
      message_stream_id: 1,
      message_length: 0,
      data: Buffer.from([]),
    });

    expect((await reader.read(3)).equals(Buffer.from([0x46, 0x4C, 0x56]))).toStrictEqual(true);
    expect((await reader.readU8())).toStrictEqual(0x01);
    expect((await reader.readU8())).toStrictEqual(0x05);
    expect((await reader.readU32BE())).toStrictEqual(9);
    expect((await reader.readU32BE())).toStrictEqual(0);
  });

  test('Write FLV Header in AMF0 onMetadata writed', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    const setDataFrame = write_amf0('onMetaData', {
      duration: 0,
      width: 1280,
      height: 720,
      videodatarate: 2700,
      framerate: 30,
      videocodecid: 7,
      audiodatarate: 160,
      audiosamplerate: 48000,
      audiosamplesize: 16,
      audiochannels: 2,
      stereo: true,
      audiocodecid: 10,
      '2.1': false,
      '3.1': false,
      '4.0': false,
      '4.1': false,
      '5.1': false,
      '7.1': false,
      encoder: 'obs-output module (libobs version 31.1.0-beta2)',
      fileSize: 0,
    });

    writer.write({
      timestamp: 0,
      message_type_id: MessageType.DataAMF0,
      message_stream_id: 1,
      message_length: setDataFrame.byteLength,
      data: setDataFrame,
    });

    expect((await reader.read(3)).equals(Buffer.from([0x46, 0x4C, 0x56]))).toStrictEqual(true);
    expect((await reader.readU8())).toStrictEqual(0x01);
    expect((await reader.readU8())).toStrictEqual(0x05);
    expect((await reader.readU32BE())).toStrictEqual(9);
    expect((await reader.readU32BE())).toStrictEqual(0);
  });

  test('Write FLV Header in AMF0 onMetadata writed (Video Only)', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    const setDataFrame = write_amf0('onMetaData', {
      duration: 0,
      width: 1280,
      height: 720,
      videodatarate: 2700,
      framerate: 30,
      videocodecid: 7,
      encoder: 'obs-output module (libobs version 31.1.0-beta2)',
      fileSize: 0,
    });

    writer.write({
      timestamp: 0,
      message_type_id: MessageType.DataAMF0,
      message_stream_id: 1,
      message_length: setDataFrame.byteLength,
      data: setDataFrame,
    });

    expect((await reader.read(3)).equals(Buffer.from([0x46, 0x4C, 0x56]))).toStrictEqual(true);
    expect((await reader.readU8())).toStrictEqual(0x01);
    expect((await reader.readU8())).toStrictEqual(0x01);
    expect((await reader.readU32BE())).toStrictEqual(9);
    expect((await reader.readU32BE())).toStrictEqual(0);
  });

  test('Write FLV Header in AMF0 onMetadata writed (Audio Only)', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    const setDataFrame = write_amf0('onMetaData', {
      duration: 0,
      audiodatarate: 160,
      audiosamplerate: 48000,
      audiosamplesize: 16,
      audiochannels: 2,
      stereo: true,
      audiocodecid: 10,
      '2.1': false,
      '3.1': false,
      '4.0': false,
      '4.1': false,
      '5.1': false,
      '7.1': false,
      encoder: 'obs-output module (libobs version 31.1.0-beta2)',
      fileSize: 0,
    });

    writer.write({
      timestamp: 0,
      message_type_id: MessageType.DataAMF0,
      message_stream_id: 1,
      message_length: setDataFrame.byteLength,
      data: setDataFrame,
    });

    expect((await reader.read(3)).equals(Buffer.from([0x46, 0x4C, 0x56]))).toStrictEqual(true);
    expect((await reader.readU8())).toStrictEqual(0x01);
    expect((await reader.readU8())).toStrictEqual(0x04);
    expect((await reader.readU32BE())).toStrictEqual(9);
    expect((await reader.readU32BE())).toStrictEqual(0);
  });

  test('Write Video Data', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    writer.write({
      timestamp: 12345678,
      message_type_id: MessageType.Video,
      message_stream_id: 1,
      message_length: 2 ** 16 + 1,
      data: Buffer.alloc(2 ** 16 + 1),
    });

    await reader.read(13);
    expect((await reader.readU8())).toStrictEqual(MessageType.Video);
    expect((await reader.readU24BE())).toStrictEqual(2 ** 16 + 1);
    expect((await reader.readU24BE())).toStrictEqual(Math.floor(12345678 / 2 ** 0) % 2 ** 24);
    expect((await reader.readU8())).toStrictEqual(Math.floor(12345678 / 2 ** 24) % 2 ** 8);
    expect((await reader.readU24BE())).toStrictEqual(0);
    expect((await reader.read(2 ** 16 + 1)).equals(Buffer.alloc(2 ** 16 + 1))).toStrictEqual(true);
  });

  test('Write Audio Data', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    writer.write({
      timestamp: 12345678,
      message_type_id: MessageType.Audio,
      message_stream_id: 1,
      message_length: 2 ** 16 + 3,
      data: Buffer.alloc(2 ** 16 + 3),
    });

    await reader.read(13);
    expect((await reader.readU8())).toStrictEqual(MessageType.Audio);
    expect((await reader.readU24BE())).toStrictEqual(2 ** 16 + 3);
    expect((await reader.readU24BE())).toStrictEqual(Math.floor(12345678 / 2 ** 0) % 2 ** 24);
    expect((await reader.readU8())).toStrictEqual(Math.floor(12345678 / 2 ** 24) % 2 ** 8);
    expect((await reader.readU24BE())).toStrictEqual(0);
    expect((await reader.read(2 ** 16 + 3)).equals(Buffer.alloc(2 ** 16 + 3))).toStrictEqual(true);
  });

  test('Write AMF0 Data', async () => {
    const reader = new AsyncByteReader();
    using writer = new FLWWriter(new Writable({
      write(chunk, _, cb) {
        reader.feed(chunk);
        cb();
      },
    }));

    writer.write({
      timestamp: 12354678,
      message_type_id: MessageType.DataAMF0,
      message_stream_id: 1,
      message_length: 2 ** 16 + 2,
      data: Buffer.alloc(2 ** 16 + 2),
    });

    await reader.read(13);
    expect((await reader.readU8())).toStrictEqual(MessageType.DataAMF0);
    expect((await reader.readU24BE())).toStrictEqual(2 ** 16 + 2);
    expect((await reader.readU24BE())).toStrictEqual(Math.floor(12354678 / 2 ** 0) % 2 ** 24);
    expect((await reader.readU8())).toStrictEqual(Math.floor(12354678 / 2 ** 24) % 2 ** 8);
    expect((await reader.readU24BE())).toStrictEqual(0);
    expect((await reader.read(2 ** 16 + 2)).equals(Buffer.alloc(2 ** 16 + 2))).toStrictEqual(true);
  });
});
