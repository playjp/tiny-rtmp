import net from 'node:net';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import intercepter from '../../01-tiny-rtmp-server/src/rtmp-intercepter.mts';
import { logger } from '../../01-tiny-rtmp-server/src/logger.mts';
import { run } from '../../01-tiny-rtmp-server/src/rtmp-session.mts';

import handle_rtmp, { AuthConfiguration } from './rtmp-accepter.mts';

const options = {
  port: {
    type: 'string',
    default: '1935',
  },
  flv: {
    type: 'string',
  },
  intercept: {
    type: 'boolean',
    default: false,
  }
} as const satisfies ParseArgsOptionsConfig;
const { values: args } = parseArgs({ options, tokens: true });
if (Number.isNaN(Number.parseInt(args.port, 10))) {
  console.error('Please Specify Valid PORT number');
  process.exit(1);
}
const port = Number.parseInt(args.port, 10);
const output = args.flv == null ? null : args.flv === '-' ? process.stdout : fs.createWriteStream(args.flv);
const intercept = args.intercept;

const server = net.createServer({ noDelay: true }, async (connection) => {
  await run(async () => {
    try {
      const proxy = intercept ? intercepter(connection) : connection;
      await handle_rtmp(proxy, AuthConfiguration.noAuth(), output ?? undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`RTMP session error: ${message}`, { stack: e instanceof Error ? e.stack : undefined });
    }
  });
});
server.listen(port);
