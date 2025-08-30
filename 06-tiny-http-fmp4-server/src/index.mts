import net from 'node:net';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';

import handle_rtmp from '../../02-tiny-http-flv-server/src/rtmp-accepter.mts';
import handle_rtmp_payload from '../../03-tiny-http-ts-server/src/rtmp-handler.mts';
import { make, trak, tkhd, avcC, mdia, mdhd, hdlr, minf, vmhd, dataInformation, sampleTable, avc1, track, initialize } from './mp4.mts';
import { read_avc_decoder_configuration_record } from '../../03-tiny-http-ts-server/src/avc.mts';

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
  let avc: Buffer | null = null;

  try {
    for await (const message of handle_rtmp(connection, app, streamKey, bandwidth)) {
      const payload = handle_rtmp_payload(message);
      if (payload == null) { continue; }

      switch (payload.kind) {
        case 'Video': {
          if (payload.codec !== 'AVC') { return; }
          if (payload.packetType === 0) {
            avc = make((vector) => {
              track(1, 0, 0, 1000, 'vide', vector, (vector) => {
                avc1(0, 0, vector, (vector) => {
                  console.error(read_avc_decoder_configuration_record(payload.avcDecoderConfigurationRecord));

                  avcC(payload.avcDecoderConfigurationRecord, vector);
                });
              });
            });
            continue;
          }
          break;
        }
        default: continue;
      }

      for (const stream of streaming.values()){
        const [write, _, need_initialize] = stream;
        //*
        if (need_initialize) {
          write(make((vector) => {
            initialize(1000, [1], vector, (vector) => {
              vector.write(avc!);
            });
          }));
        }
        //*/
        //*
        {
          const header = write_tag_header(message);
          write(header);
          write(message.data);
          write(write_previous_tag_size(header, message));
        }
        //*/
        stream[2] = false;
      };
    }
  } catch (e) {
    console.error(e);
  } finally {
    for (const [,end] of streaming.values()) { end(); }
  }
};

const rtmp_server = net.createServer({ noDelay: true }, async (connection) => {
  await handle(connection);
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

  const exit = () => { res.end(); streaming.delete(viewer); };
  const entry = [write, exit, true] satisfies StreamingInformation;
  streaming.set(viewer, entry);

  req.on('close', exit);
  res.on('close', exit);
  req.on('error', exit);
  res.on('error', exit);
});
web_server.listen({ port: web });
