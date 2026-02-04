import net from 'node:net';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import handle_rtmp from '../../01-tiny-rtmp-server/src/rtmp-accepter.mts';
import intercepter from '../../01-tiny-rtmp-server/src/rtmp-intercepter.mts';
import { run } from '../../01-tiny-rtmp-server/src/rtmp-session.mts';
import { logger } from '../../01-tiny-rtmp-server/src/logger.mts';

import AdobeAuthSession from './auth-session.mts';

const options = {
  port: {
    type: 'string',
    default: '1935',
  },
  user: {
    type: 'string',
  },
  password: {
    type: 'string',
  },
  flv: {
    type: 'string',
  },
  intercept: {
    type: 'boolean',
    default: false,
  },
} as const satisfies ParseArgsOptionsConfig;
const { values: args } = parseArgs({ options, tokens: true });
if (Number.isNaN(Number.parseInt(args.port, 10))) {
  console.error('Please Specify Valid PORT number');
  process.exit(1);
}
if (args.user == null) {
  console.error('Please Specify Valid user');
  process.exit(1);
}
if (args.password == null) {
  console.error('Please Specify Valid password');
  process.exit(1);
}
const port = Number.parseInt(args.port, 10);
const user = args.user;
const password = args.password;
const output = args.flv == null ? null : args.flv === '-' ? process.stdout : fs.createWriteStream(args.flv);
const intercept = args.intercept;
const auth = new AdobeAuthSession((userName) => user === userName ? password : null);

const server = net.createServer({ noDelay: true }, async (connection) => {
  await run(async () => {
    try {
      const proxy = intercept ? intercepter(connection) : connection;
      await handle_rtmp(proxy, auth, output ?? undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`RTMP session error: ${message}`, { stack: e instanceof Error ? e.stack : undefined });
    }
  });
});
server.listen(port);
