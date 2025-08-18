import net from 'node:net';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import handle_rtmp from '../../02-tiny-http-flv-server/src/rtmp-accepter.mts';

import LLHLSGenerator from './llhls-generator.mts';

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
  partDuration: {
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
if (args.partDuration != null && Number.isNaN(Number.parseFloat(args.partDuration))) {
  console.error('Please Specify valid partDuration'); process.exit(1);
}
const port = Number.parseInt(args.rtmp, 10);
const web = Number.parseInt(args.web, 10);
const app = args.app;
const streamKey = args.streamKey;
const bandwidth = args.bandwidth != null ? Number.parseInt(args.bandwidth, 10) : undefined;
const partDuration = args.partDuration != null ? Number.parseFloat(args.partDuration) : undefined;

let rtmp_to_llhls: LLHLSGenerator | null = null;
const handle = async (connection: Duplex) => {
  try {
    for await (const message of handle_rtmp(connection, app, streamKey, bandwidth)) {
      if (rtmp_to_llhls == null) { rtmp_to_llhls = new LLHLSGenerator({ liveWindowLength: 3, partialSegmentDuration: partDuration }); }
      rtmp_to_llhls.feed(message);
    }
  } catch (e) {
    console.error(e);
  } finally {
    rtmp_to_llhls = null;
  }
};

const rtmp_server = net.createServer({ noDelay: true }, async (connection) => {
  await handle(connection);
});
rtmp_server.listen(port);

const web_server = http.createServer(async (req, res) => {
  const notfound = () => {
    res.writeHead(404, { 'access-control-allow-origin': '*' });
    res.end();
  };
  if (req.url == null) {
    notfound();
    return;
  }
  const url = new URL(req.url, `http://localhost:${web}`);
  if (!(req.method === 'GET' && url.pathname.startsWith(`/${app}/${streamKey}/`))) {
    notfound();
    return;
  }
  if (rtmp_to_llhls == null) {
    notfound();
    return;
  }

  const prefix = url.pathname.slice(`/${app}/${streamKey}/`.length);
  if (prefix === 'playlist.m3u8') {
    const published = await rtmp_to_llhls.published();
    if (!published) {
      notfound();
      return;
    }

    const msn_str = url.searchParams.get('_HLS_msn');
    const part_str = url.searchParams.get('_HLS_part');

    if (msn_str == null || Number.isNaN(Number.parseInt(msn_str, 10))) {
      res.writeHead(200, {
        'content-type': 'application/vnd.apple.mpegurl',
        'access-control-allow-origin': '*',
      });
      res.write(rtmp_to_llhls.m3u8());
      res.end();
      return;
    }
    if (part_str != null && Number.isNaN(Number.parseInt(part_str, 10))) {
      res.writeHead(200, {
        'content-type': 'application/vnd.apple.mpegurl',
        'access-control-allow-origin': '*',
      });
      res.write(rtmp_to_llhls.m3u8());
      res.end();
      return;
    }
    const msn = Number.parseInt(msn_str, 10);
    const part = part_str == null ? 0 : Number.parseInt(part_str, 10);

    res.writeHead(200, {
      'content-type': 'application/vnd.apple.mpegurl',
      'access-control-allow-origin': '*',
    });
    await rtmp_to_llhls.block(msn, part);
    res.write(rtmp_to_llhls.m3u8());
    res.end();
    return;
  }

  if (prefix.endsWith('.ts')) {
    const slice = prefix.slice(0, -3);
    const splited = slice.split('_');
    const head = (found: boolean) => {
      if (!found) {
        res.writeHead(404, {
          'access-control-allow-origin': '*',
        });
      } else {
        res.writeHead(200, {
          'content-type': 'video/mp2t',
          'access-control-allow-origin': '*',
        });
      }
    };

    if (splited.length === 2 && splited.every((x) => !Number.isNaN(Number.parseInt(x, 10)))) {
      const msn = Number.parseInt(splited[0], 10);
      const part = Number.parseInt(splited[1], 10);

      rtmp_to_llhls.stream(msn, part, res, head);
      return;
    }
    if (!Number.isNaN(Number.parseInt(slice, 10))) {
      const msn = Number.parseInt(slice, 10);
      const part = null;

      rtmp_to_llhls.stream(msn, part, res, head);
      return;
    }
  }

  notfound();
  return;
});
web_server.listen({ port: web });
