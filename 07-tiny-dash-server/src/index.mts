import net from 'node:net';
import http from 'node:http';
import type { Duplex } from 'node:stream';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import handle_rtmp, { AuthConfiguration } from '../../02-tiny-http-flv-server/src/rtmp-accepter.mts';

import DASHGenerator from './dash-generator.mts';

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

const page = `
<!DOCTYPE html>
<html>
  <body>
    <video id="video" controls></video>
    <script src="https://cdn.dashjs.org/latest/modern/umd/dash.all.min.js"></script>
    <!-- <script src="https://cdn.dashjs.org/latest/modern/umd/dash.all.debug.js"></script> -->
    <script>
      function init() {
        const video = document.querySelector("video");
        const url = "./manifest.mpd";
        const player = dashjs.MediaPlayer().create();
        /*
        player.updateSettings({
          'debug': {
              'logLevel': dashjs.Debug.LOG_LEVEL_DEBUG
          }
        });
        //*/
        player.initialize(video, url, true);
      }
      init();
    </script>
  </body>
</html>
`.trimStart();

let rtmp_to_dash: DASHGenerator | null = null;
const handle = async (connection: Duplex) => {
  try {
    for await (const message of handle_rtmp(connection, AuthConfiguration.simpleAuth(app, streamKey), bandwidth)) {
      if (rtmp_to_dash == null) { rtmp_to_dash = new DASHGenerator(3); }
      rtmp_to_dash.feed(message);
    }
  } catch (e) {
    console.error(e);
  } finally {
    rtmp_to_dash = null;
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
  if (rtmp_to_dash == null) {
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
  if (prefix === 'manifest.mpd') {
    res.writeHead(200, {
      'content-type': 'application/dash+xml',
      'access-control-allow-origin': '*',
      'cache-control': 'maxage=0',
    });
    res.write(rtmp_to_dash.mpd());
    res.end();
    return;
  }
  if (prefix.endsWith('.mp4')) {
    const type = prefix.slice(0, 5); // video/audio + _ + init
    const init = prefix.slice(6, -4);
    if (init !== 'init') {
      res.writeHead(404, {
        'access-control-allow-origin': '*',
        'cache-control': 'maxage=0',
      });
      res.end();
      return;
    }

    const segment = rtmp_to_dash.initialize(type);
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
    const type = prefix.slice(0, 5); // video/audio + _ + seq
    const index = Number.parseInt(prefix.slice(6, -4), 10);
    if (Number.isNaN(index)) {
      res.writeHead(404, {
        'access-control-allow-origin': '*',
        'cache-control': 'maxage=0',
      });
      res.end();
      return;
    }

    const segment = rtmp_to_dash.segment(type, index);
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
