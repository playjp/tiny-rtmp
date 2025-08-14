import type { Message } from './message-reader.mts';

export default (message: Omit<Message, 'message_length'>): Buffer => {
  let chunk_maximum_size = 128;
  const result: Buffer[] = [];

  for (let i = 0; i < message.data.byteLength; i += chunk_maximum_size) {
    const chunk = message.data.subarray(i, Math.min(message.data.byteLength, i + chunk_maximum_size));
    const cs_id = 3; // こちらからはシステム系のメッセージしか送らないので 3 に固定する
    const fmt = i === 0 ? 0 : 3; // 簡単化のため 0 か 3 以外は使わない
    const basic = Buffer.from([(fmt << 6) | cs_id]);

    if (fmt === 3) {
      result.push(basic, chunk);
      continue;
    }

    const header = Buffer.alloc(message.timestamp >= 0xFFFFFF ? 15 : 11);
    header.writeUIntBE(Math.min(message.timestamp, 0xFFFFFF), 0, 3);
    header.writeUIntBE(message.data.byteLength, 3, 3);
    header.writeUIntBE(message.message_type_id, 6, 1);
    header.writeUIntLE(message.message_stream_id, 7, 4);
    if (message.timestamp >= 0xFFFFFF) {
      header.writeUIntBE(message.timestamp, 11, 4);
    }

    result.push(basic, header, chunk);
  }

  return Buffer.concat(result);
};
