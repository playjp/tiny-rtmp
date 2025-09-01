import net from 'node:net';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import type { Message } from '../../01-tiny-rtmp-server/src/message-reader.mts';

import handle_rtmp from '../../02-tiny-http-flv-server/src/rtmp-accepter.mts';
import handle_rtmp_payload, { FrameType } from '../../03-tiny-http-ts-server/src/rtmp-handler.mts';
import { make, initialize, fragment } from './mp4.mts';
import { write_mp4_avc_track_information } from './avc.mts';
import { write_mp4_aac_track_information } from './aac.mts';
import FMP4Transmuxer from './fmp4-transmuxer.mts';

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

type StreamingInformation = [writeFn: (buffer: Buffer) => void, exitFn: () => void, initialized: boolean];
const streaming = new Map<number, StreamingInformation>();
const handle = async (connection: Duplex) => {
  const rtmp_to_fmp4 = new FMP4Transmuxer();

  try {
    for await (const message of handle_rtmp(connection, app, streamKey, bandwidth)) {
      const frag = rtmp_to_fmp4.feed(message);
      if (frag == null) { continue; }

      for (const stream of streaming.values()){
        const [write] = stream;
        if (stream[2]) {
          const init = rtmp_to_fmp4.initialize();
          if (init == null) { continue; }
          write(init);
          stream[2] = false;
        }
        {
          write(frag);
        }
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
