import net from 'node:net';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import { run } from '../../01-tiny-rtmp-server/src/rtmp-session.mts';
import { logger } from '../../01-tiny-rtmp-server/src/logger.mts';

import handle_rtmp, { AuthConfiguration } from '../../02-tiny-http-flv-server/src/rtmp-accepter.mts';

import HLSGenerator from './hls-generator.mts';

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
  maxage: {
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
if (args.maxage != null && Number.isNaN(Number.parseInt(args.maxage, 10))) {
  console.error('Please Specify valid maxage'); process.exit(1);
}
const port = Number.parseInt(args.rtmp, 10);
const web = Number.parseInt(args.web, 10);
const app = args.app;
const streamKey = args.streamKey;
const bandwidth = args.bandwidth != null ? Number.parseInt(args.bandwidth, 10) : undefined;
const maxage = args.maxage != null ? Number.parseInt(args.maxage, 10) : 36000;
const auth = AuthConfiguration.simpleAuth(app, streamKey);

const page = `
<!DOCTYPE html>
<html>
  <body>
    <video id="video" controls></video>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1"></script>
    <script>
      function init() {
        const video = document.querySelector("video");
        const url = "./playlist.m3u8";
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
        } else if (Hls.isSupported()) {
          const player = new Hls();
          player.loadSource(url);
          player.attachMedia(video);
        }
      }
      init();
    </script>
  </body>
</html>
`.trimStart();

let rtmp_to_hls: HLSGenerator | null = null;
const handle = async (connection: Duplex) => {
  try {
    for await (const message of handle_rtmp(connection, { auth, limit: { bandwidth } })) {
      if (rtmp_to_hls == null) { rtmp_to_hls = new HLSGenerator(3); }
      rtmp_to_hls.feed(message);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`RTMP session error: ${message}`, e instanceof Error ? { stack: e.stack } : undefined);
  } finally {
    rtmp_to_hls = null;
  }
};

const rtmp_server = net.createServer({ noDelay: true }, async (connection) => {
  await run(async () => {
    await handle(connection);
  });
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
  if (rtmp_to_hls == null) {
    notfound();
    return;
  }

  const prefix = url.pathname.slice(`/${app}/${streamKey}/`.length);
  if (prefix === '' || prefix === 'index.html') {
    res.writeHead(200, {
      'content-type': 'text/html',
      'access-control-allow-origin': '*',
      'cache-control': 'maxage=0',
    });
    res.write(page);
    res.end();
    return;
  }
  if (prefix === 'playlist.m3u8') {
    const published = await rtmp_to_hls.published();
    if (!published) {
      notfound();
      return;
    }

    res.writeHead(200, {
      'content-type': 'application/vnd.apple.mpegurl',
      'access-control-allow-origin': '*',
      'cache-control': 'maxage=0',
    });
    res.write(rtmp_to_hls.m3u8());
    res.end();
    return;
  }
  if (prefix.endsWith('.mp4')) {
    const init = prefix.slice(0, -'.mp4'.length);
    if (init !== 'init') {
      res.writeHead(404, {
        'access-control-allow-origin': '*',
        'cache-control': 'maxage=0',
      });
      res.end();
      return;
    }

    const segment = rtmp_to_hls.initialize();
    if (segment == null) {
      res.writeHead(404, {
        'access-control-allow-origin': '*',
        'cache-control': 'maxage=0',
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      'content-type': 'video/mp4',
      'access-control-allow-origin': '*',
      'cache-control': `maxage=${maxage}`,
    });
    res.write(segment);
    res.end();
    return;
  }
  if (prefix.endsWith('.m4s')) {
    const index = Number.parseInt(prefix.slice(0, -'.m4s'.length));
    if (Number.isNaN(index)) {
      res.writeHead(404, {
        'access-control-allow-origin': '*',
        'cache-control': 'maxage=0',
      });
      res.end();
      return;
    }

    const segment = rtmp_to_hls.segment(index);
    if (segment == null) {
      res.writeHead(404, {
        'access-control-allow-origin': '*',
        'cache-control': 'maxage=0',
      });
      res.end();
      return;
    }

    res.writeHead(200, {
      'content-type': 'video/mp4',
      'access-control-allow-origin': '*',
      'cache-control': `maxage=${maxage}`,
    });
    res.write(segment);
    res.end();
    return;
  }

  notfound();
});
web_server.listen({ port: web });
