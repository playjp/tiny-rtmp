import net from 'node:net';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import handle_rtmp, { AuthConfiguration } from './rtmp-accepter.mts';
import intercepter from './rtmp-intercepter.mts';
import { run } from './rtmp-session.mts';
import { logger } from './logger.mts';

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
  },
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
      logger.error(`RTMP session error: ${message}`, e instanceof Error ? { stack: e.stack } : undefined);
    }
  });
});
server.listen(port);
