import tls from 'node:tls';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import handle_rtmp from '../../01-tiny-rtmp-server/src/rtmp-session.mts';

const options = {
  port: {
    type: 'string',
    default: '1935',
  },
  key: {
    type: 'string',
  },
  cert: {
    type: 'string',
  },
  flv: {
    type: 'string',
  },
} as const satisfies ParseArgsOptionsConfig;
const { values: args } = parseArgs({ options, tokens: true });
if (Number.isNaN(Number.parseInt(args.port, 10))) {
  console.error('Please Specify Valid PORT number');
  process.exit(1);
}
if (args.key == null) {
  console.error('Please Specify Valid SSL/TLS key');
  process.exit(1);
}
if (args.cert == null) {
  console.error('Please Specify Valid SSL/TLS cert');
  process.exit(1);
}
const port = Number.parseInt(args.port, 10);
const output = args.flv == null ? null : args.flv === '-' ? process.stdout : fs.createWriteStream(args.flv);
const key = fs.readFileSync(args.key);
const cert = fs.readFileSync(args.cert);

const server = tls.createServer({ noDelay: true, key, cert }, async (connection) => {
  await handle_rtmp(connection, output ?? undefined);
});
server.listen(port);
