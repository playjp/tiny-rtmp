import net from 'node:net';
import http from 'node:http';
import crypto from 'node:crypto';
import { Writable, type Duplex } from 'node:stream';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import AsyncByteReader from '../../01-tiny-rtmp-server/src/async-byte-reader.mts';
import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';
import { MessageType } from '../../01-tiny-rtmp-server/src/message.mts';
import type { Message } from '../../01-tiny-rtmp-server/src/message.mts';
import read_amf0 from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import write_amf0 from '../../01-tiny-rtmp-server/src/amf0-writer.mts';
import handle_rtmp, { AuthConfiguration } from '../../02-tiny-http-flv-server/src/rtmp-accepter.mts';

const options = {
  rtmp: {
    type: 'string',
    default: '1935',
  },
  web: {
    type: 'string',
    default: '8000',
  },
  app: {
    type: 'string',
  },
  streamKey: {
    type: 'string',
  },
  bandwidth: {
    type: 'string',
  },
} as const satisfies ParseArgsOptionsConfig;
const { values: args } = parseArgs({ options, tokens: true });
if (Number.isNaN(Number.parseInt(args.rtmp, 10))) {
  console.error('Please Specify valid port number'); process.exit(1);
}
if (Number.isNaN(Number.parseInt(args.web, 10))) {
  console.error('Please Specify valid port number'); process.exit(1);
}
if (args.app == null) {
  console.error('Please Specify valid app'); process.exit(1);
}
if (args.streamKey == null) {
  console.error('Please Specify valid streamKey'); process.exit(1);
}
if (args.bandwidth != null && Number.isNaN(Number.parseInt(args.bandwidth, 10))) {
  console.error('Please Specify valid bandwidth'); process.exit(1);
}
const port = Number.parseInt(args.rtmp, 10);
const web = Number.parseInt(args.web, 10);
const app = args.app;
const streamKey = args.streamKey;
const bandwidth = args.bandwidth != null ? Number.parseInt(args.bandwidth, 10) : undefined;

const write_tag_header = (message: Message): Buffer => {
  const header = Buffer.alloc(11);
  header.writeUIntBE(message.message_type_id, 0, 1);
  header.writeUIntBE(message.data.byteLength, 1, 3);
  header.writeUInt8(Math.floor(message.timestamp / (2 ** 16)) % (2 ** 8), 4);
  header.writeUInt8(Math.floor(message.timestamp / (2 **  8)) % (2 ** 8), 5);
  header.writeUInt8(Math.floor(message.timestamp / (2 **  0)) % (2 ** 8), 6);
  header.writeUInt8(Math.floor(message.timestamp / (2 ** 24)) % (2 ** 8), 7);
  header.writeUIntBE(0, 8, 3);
  return header;
};

const write_previous_tag_size = (header: Buffer, message: Message): Buffer => {
  const previousTagSize = Buffer.alloc(4);
  previousTagSize.writeUInt32BE(header.byteLength + message.data.byteLength, 0);
  return previousTagSize;
};

type StreamingInformation = [writeFn: (buffer: Buffer) => void, exitFn: () => void, initialized: boolean];
const streaming = new Map<number, StreamingInformation>();
const handle = async (connection: Duplex) => {
  let onMetadataMessage: Message | null = null;
  let avcConfigMessage: Message | null = null;
  let aacConfigMessage: Message | null = null;

  try {
    for await (const message of handle_rtmp(connection, { auth: AuthConfiguration.simpleAuth(app, streamKey), limit: { bandwidth } })) {
      const reader = new ByteReader(message.data);
      switch (message.message_type_id) {
        case MessageType.Video: {
          const codec = reader.readU8() & 0x0F;
          if (codec !== 0x07) { continue; } // Accept AVC
          const packetType = reader.readU8();
          if (packetType === 0) { avcConfigMessage = message; }
          break;
        }
        case MessageType.Audio: {
          const codec = reader.readU8() >> 4;
          if (codec !== 10) { continue; } // Accept AAC
          const packetType = reader.readU8();
          if (packetType === 0) { aacConfigMessage = message; }
          break;
        }
        case MessageType.DataAMF0: {
          const command = read_amf0(message.data);
          if (command.length !== 3 || command[0] !== '@setDataFrame' || command[1] !== 'onMetaData') { continue; }
          onMetadataMessage ={ ... message, data: write_amf0(command[1], command[2]) };
          break;
        }
        default: continue;
      }

      for (const stream of streaming.values()){
        const [write, _, initialize] = stream;
        if (initialize) {
          for (const message of [onMetadataMessage, avcConfigMessage, aacConfigMessage]) {
            if (message == null) { continue; }
            const header = write_tag_header(message);
            write(header);
            write(message.data);
            write(write_previous_tag_size(header, message));
          }
        }
        {
          const header = write_tag_header(message);
          write(header);
          write(message.data);
          write(write_previous_tag_size(header, message));
        }
        stream[2] = false;
      };
    }
  } catch (e) {
    console.error(e);
  } finally {
    for (const [,end] of streaming.values()) { end(); }
  }
};

const pingpong = async (reader: AsyncByteReader, writable: Writable): Promise<void> => {
  try {
    while (true) {
      const first = await reader.readU8();
      const fin = (first & 0x80) !== 0;
      const rsv1 = (first & 0x40) !== 0;
      const rsv2 = (first & 0x20) !== 0;
      const rsv3 = (first & 0x10) !== 0;
      const opcode = (first & 0x0F) >> 0;

      const second = await reader.readU8();
      const mask = (second & 0x80) !== 0;
      let payload_len = BigInt((second & 0x7F) >> 0);
      if (payload_len === 126n) {
        payload_len = BigInt(await reader.readU16BE());
      } else if (payload_len === 127n) {
        payload_len = (await reader.read(8)).readBigInt64BE(0);
      }
      if (payload_len > Number.MAX_SAFE_INTEGER) {
        writable.end();
        break;
      }
      const len = Number(payload_len);

      const maskingKey = mask ? await reader.read(4) : Buffer.alloc(4);
      const payload = await reader.read(len);
      for (let i = 0; i < payload.length; i++) {
        payload[i] = payload[i] ^ maskingKey[i % 4];
      }

      if (opcode !== 0x09) { continue; } // Ping
      writable.write(Buffer.from([0x8a])); // FIN + Opcode(Pong)
      if (payload.byteLength >= 2 ** 16) {
        writable.write(Buffer.from([127])); // NoMASK and 8 bytes
        const length = Buffer.alloc(8);
        length.writeBigInt64BE(BigInt(payload.byteLength), 0);
        writable.write(length);
      } else if (payload.byteLength >= 126) {
        writable.write(Buffer.from([126])); // NoMASK and 8 bytes
        const length = Buffer.alloc(2);
        length.writeUInt16BE(payload.byteLength, 0);
        writable.write(length);
      } else {
        writable.write(Buffer.from([payload.byteLength]));
      }
      writable.write(payload);
    }
  } catch (e) {}
};

const rtmp_server = net.createServer({ noDelay: true }, async (connection) => {
  await handle(connection);
});
rtmp_server.listen(port);

let viewers = 0;
const web_server = http.createServer();
web_server.addListener('upgrade', (req, socket, _) => {
  const response = (status: number, message: string, headers?: Record<string, string>) => {
    const newline = '\r\n';
    socket.write(`HTTP/1.1 ${status} ${message}` + newline);
    for (const [key, value] of Object.entries(headers ?? {})) {
      socket.write(`${key}: ${value}` + newline);
    }
    socket.write(newline);
  };

  if (req.url == null) {
    response(404, 'Not Found', { 'access-control-allow-origin': '*' });
    socket.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${web}`);
  if (!(req.method === 'GET' && url.pathname === `/${app}/${streamKey}`)) {
    response(404, 'Not Found', { 'access-control-allow-origin': '*' });
    socket.end();
    return;
  }

  // Websocket
  const version = req.headers['Sec-WebSocket-Version'.toLowerCase()];
  const key = req.headers['Sec-WebSocket-Key'.toLowerCase()];
  const extensions = req.headers['Sec-WebSocket-Extensions'.toLowerCase()];
  const sha1 = crypto.createHash('sha1');
  sha1.update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11');
  const accept = sha1.digest('base64');
  // Send Switching Upgrade
  response(101, 'Switching Protocols', {
    'Upgrade': 'websocket',
    'Connection': 'Upgrade',
    'Sec-WebSocket-Accept': accept,
  });

  // recieve prepare
  const reader = new AsyncByteReader();
  socket.on('data', (chunk) => {
    reader.feed(chunk);
  });
  socket.on('close', () => {
    reader.feedEOF();
  });
  pingpong(reader, socket); // do ping pong

  const viewer = viewers++;
  const write = (chunk: Buffer) => {
    if (socket.closed) { return; }

    socket.write(Buffer.from([0x82])); // FIN + Opcode(Binary)
    if (chunk.byteLength >= 2 ** 16) {
      socket.write(Buffer.from([127])); // NoMASK and 8 bytes
      const length = Buffer.alloc(8);
      length.writeBigInt64BE(BigInt(chunk.byteLength), 0);
      socket.write(length);
    } else if (chunk.byteLength >= 126) {
      socket.write(Buffer.from([126])); // NoMASK and 8 bytes
      const length = Buffer.alloc(2);
      length.writeUInt16BE(chunk.byteLength, 0);
      socket.write(length);
    } else {
      socket.write(Buffer.from([chunk.byteLength]));
    }
    // 126 以下で 64bit length とかしようとすると、受信できないことがある
    socket.write(chunk);
  };
  write(Buffer.from([
    0x46, 0x4C, 0x56, // Signature (FLV)
    1,                // version
    4 | 1,            // 4: Audio Present, 1: Video Present
    0, 0, 0, 9,       // Header Bytes
    0, 0, 0, 0,       // PrivousTagSize0
  ]));

  const exit = () => { socket.end(); streaming.delete(viewer); };
  const entry = [write, exit, true] satisfies StreamingInformation;
  streaming.set(viewer, entry);

  req.on('close', exit);
  socket.on('close', exit);
  req.on('error', exit);
  socket.on('error', exit);
});
web_server.listen({ port: web });
