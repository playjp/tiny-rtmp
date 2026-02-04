import net from 'node:net';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import ByteReader from '../../01-tiny-rtmp-server/src/byte-reader.mts';
import { MessageType, type SerializedMessage } from '../../01-tiny-rtmp-server/src/message.mts';
import read_amf0 from '../../01-tiny-rtmp-server/src/amf0-reader.mts';
import write_amf0 from '../../01-tiny-rtmp-server/src/amf0-writer.mts';
import { run } from '../../01-tiny-rtmp-server/src/rtmp-session.mts';
import { logger } from '../../01-tiny-rtmp-server/src/logger.mts';

import handle_rtmp, { AuthConfiguration } from './rtmp-accepter.mts';

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
  highWaterMark: {
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
if (args.highWaterMark != null && Number.isNaN(Number.parseInt(args.highWaterMark, 10))) {
  console.error('Please Specify valid highwatermark'); process.exit(1);
}
if (args.bandwidth != null && Number.isNaN(Number.parseInt(args.bandwidth, 10))) {
  console.error('Please Specify valid bandwidth'); process.exit(1);
}
const port = Number.parseInt(args.rtmp, 10);
const web = Number.parseInt(args.web, 10);
const app = args.app;
const streamKey = args.streamKey;
const highWaterMark = args.highWaterMark != null ? Number.parseInt(args.highWaterMark, 10) : undefined;
const bandwidth = args.bandwidth != null ? Number.parseInt(args.bandwidth, 10) : undefined;
const auth = AuthConfiguration.simpleAuth(app, streamKey);

const write_tag_header = (message: SerializedMessage): Buffer => {
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

const write_previous_tag_size = (header: Buffer, message: SerializedMessage): Buffer => {
  const previousTagSize = Buffer.alloc(4);
  previousTagSize.writeUInt32BE(header.byteLength + message.data.byteLength, 0);
  return previousTagSize;
};

type StreamingInformation = [writeFn: (buffer: Buffer) => void, exitFn: () => void, initialized: boolean];
const streaming = new Map<number, StreamingInformation>();
const handle = async (connection: Duplex) => {
  let onMetadataMessage: SerializedMessage | null = null;
  let avcConfigMessage: SerializedMessage | null = null;
  let aacConfigMessage: SerializedMessage | null = null;

  try {
    for await (const message of handle_rtmp(connection, { auth, limit: { bandwidth } })) {
      switch (message.message_type_id) {
        case MessageType.Video: {
          const reader = new ByteReader(message.data);
          const codec = reader.readU8() & 0x0F;
          if (codec !== 0x07) { continue; } // Accept AVC
          const packetType = reader.readU8();
          if (packetType === 0) { avcConfigMessage = message; }
          break;
        }
        case MessageType.Audio: {
          const reader = new ByteReader(message.data);
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
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`RTMP session error: ${message}`, e instanceof Error ? { stack: e.stack } : undefined);
  } finally {
    for (const [,end] of streaming.values()) { end(); }
  }
};

const rtmp_server = net.createServer({ noDelay: true }, async (connection) => {
  await run(async () => {
    await handle(connection);
  });
});
rtmp_server.listen(port);

let viewers = 0;
const web_server = http.createServer({ highWaterMark }, (req, res) => {
  if (req.url == null) {
    res.writeHead(404, { 'access-control-allow-origin': '*' });
    res.end();
    return;
  }
  const url = new URL(req.url, `http://localhost:${web}`);
  if (!(req.method === 'GET' && url.pathname === `/${app}/${streamKey}`)) {
    res.writeHead(404, { 'access-control-allow-origin': '*' });
    res.end();
    return;
  }
  const viewer = viewers++;
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'access-control-allow-origin': '*',
  });

  const write = (chunk: Buffer) => {
    if (res.closed) { return; }
    if (!res.write(chunk) && highWaterMark != null) { res.destroy(); }
  };
  write(Buffer.from([
    0x46, 0x4C, 0x56, // Signature (FLV)
    1,                // version
    4 | 1,            // 4: Audio Present, 1: Video Present
    0, 0, 0, 9,       // Header Bytes
    0, 0, 0, 0,       // PrivousTagSize0
  ]));

  const exit = () => { res.end(); streaming.delete(viewer); };
  const entry = [write, exit, true] satisfies StreamingInformation;
  streaming.set(viewer, entry);

  req.on('close', exit);
  res.on('close', exit);
  req.on('error', exit);
  res.on('error', exit);
});
web_server.listen({ port: web });
