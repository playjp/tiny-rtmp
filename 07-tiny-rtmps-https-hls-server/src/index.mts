import tls from 'node:tls';
import https from 'node:https';
import fs from 'node:fs';
import type { Duplex } from 'node:stream';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import handle_rtmp from '../../02-tiny-http-flv-server/src/rtmp-accepter.mts';

import HLSGenerator from '../../04-tiny-hls-server/src/hls-generator.mts';

const options = {
  rtmp: {
    type: 'string',
    default: '1935',
  },
  web: {
    type: 'string',
    default: '8000',
  },
  key: {
    type: 'string',
  },
  cert: {
    type: 'string',
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
  http2: {
    type: 'boolean'
  }
} as const satisfies ParseArgsOptionsConfig;
const { values: args } = parseArgs({ options, tokens: true });
if (Number.isNaN(Number.parseInt(args.rtmp, 10))) {
  console.error('Please Specify valid port number'); process.exit(1);
}
if (Number.isNaN(Number.parseInt(args.web, 10))) {
  console.error('Please Specify valid port number'); process.exit(1);
}
if (args.key == null) {
  console.error('Please Specify Valid SSL/TLS key'); process.exit(1);
}
if (args.cert == null) {
  console.error('Please Specify Valid SSL/TLS cert'); process.exit(1);
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
const key = fs.readFileSync(args.key);
const cert = fs.readFileSync(args.cert);
const app = args.app;
const streamKey = args.streamKey;
const bandwidth = args.bandwidth != null ? Number.parseInt(args.bandwidth, 10) : undefined;

let rtmp_to_hls: HLSGenerator | null = null;
const handle = async (connection: Duplex) => {
  try {
    for await (const message of handle_rtmp(connection, app, streamKey, bandwidth)) {
      if (rtmp_to_hls == null) { rtmp_to_hls = new HLSGenerator(3); }
      rtmp_to_hls.feed(message);
    }
  } catch (e) {
    console.error(e);
  } finally {
    rtmp_to_hls = null;
  }
};

const rtmp_server = tls.createServer({ noDelay: true, key, cert }, async (connection) => {
  await handle(connection);
});
rtmp_server.listen(port);

const web_server = https.createServer({ key, cert }, async (req, res) => {
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
  if (rtmp_to_hls == null) {
    notfound();
    return;
  }

  const prefix = url.pathname.slice(`/${app}/${streamKey}/`.length);
  if (prefix === 'playlist.m3u8') {
    const published = await rtmp_to_hls.published();
    if (!published) {
      notfound();
      return;
    }

    res.writeHead(200, {
      'content-type': 'application/vnd.apple.mpegurl',
      'access-control-allow-origin': '*',
    });
    res.write(rtmp_to_hls.m3u8());
    res.end();
    return;
  }
  if (prefix.endsWith('.ts') && !Number.isNaN(Number.parseInt(prefix.slice(0, -3), 10))) {
    const index = Number.parseInt(prefix.slice(0, -3), 10);

    rtmp_to_hls.segment(index, res, (found: boolean) => {
      if (!found) {
        res.writeHead(404, {
          'access-control-allow-origin': '*',
        });
        res.end();
      } else {
        res.writeHead(200, {
          'content-type': 'video/mp2t',
          'access-control-allow-origin': '*',
        });
      }
    });
    return;
  }

  notfound();
});
web_server.listen({ port: web });
