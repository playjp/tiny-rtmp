import net from 'node:net';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import type { ParseArgsOptionsConfig } from 'node:util';

import handle_rtmp from './rtmp-session.mts';
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

const auth = new AdobeAuthSession(user, password);

const server = net.createServer({ noDelay: true }, async (connection) => {
  await handle_rtmp(connection, auth, output ?? undefined);
});
server.listen(port);
