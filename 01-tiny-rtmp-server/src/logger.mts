import { formatWithOptions, inspect, styleText } from 'node:util';

import { load } from './rtmp-session.mts';

export const LogLevel = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5,
} as const;

export interface Logger {
  trace(... args: unknown[]): void;
  debug(... args: unknown[]): void;
  info(... args: unknown[]): void;
  warn(... args: unknown[]): void;
  error(... args: unknown[]): void;
  fatal(... args: unknown[]): void;
}

export class NoopLogger implements Logger {
  trace(): void {};
  debug(): void {};
  info(): void {};
  warn(): void {};
  error(): void {};
  fatal(): void {};
};

const flat = (obj: unknown): string => {
  return inspect(obj, {
    depth: Number.POSITIVE_INFINITY,
    breakLength: Number.POSITIVE_INFINITY,
    compact: true,
  });
};

const normalize = (arg: unknown): unknown => {
  if (!(arg instanceof Error)) { return arg; }
  return { name: arg.name, message: arg.message, stack: arg.stack };
};

const format = (... args: unknown[]): string => {
  return args.map((arg) => typeof arg === 'string' ? arg : flat(normalize(arg))).join(' ');
};

const datetime = (): string => {
  const date = new Date();
  const date_string = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  const time_string = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}.${date.getMilliseconds().toString().padStart(3, '0')}`;
  return `${date_string} ${time_string}`;
};

const is_empty = (record: Record<string, unknown>): boolean => {
  return Object.keys(record).length === 0;
};

export class ConsoleLogger implements Logger {
  private loglevel: number;
  public constructor(loglevel?: number) {
    this.loglevel = loglevel ?? LogLevel.INFO;
  }

  trace(... args: unknown[]): void {
    if (this.loglevel > LogLevel.TRACE) { return; }
    const level = styleText(['gray', 'bgBlack', 'dim'], '[TRACE]', { stream: process.stderr });
    const record = load() ?? {};
    if (is_empty(record)) {
      console.error(datetime(), level, format(... args));
    } else {
      console.error(datetime(), level, format(... args), flat(record));
    }
  }

  debug(... args: unknown[]): void {
    if (this.loglevel > LogLevel.DEBUG) { return; }
    const level = styleText(['gray', 'bgBlack'], '[DEBUG]', { stream: process.stderr });
    const record = load() ?? {};
    if (is_empty(record)) {
      console.error(datetime(), level, format(... args));
    } else {
      console.error(datetime(), level, format(... args), flat(record));
    }
  }

  info(... args: unknown[]): void {
    if (this.loglevel > LogLevel.INFO) { return; }
    const level = styleText(['white', 'bgBlack'], '[INFO]', { stream: process.stderr });
    const record = load() ?? {};
    if (is_empty(record)) {
      console.error(datetime(), level, format(... args));
    } else {
      console.error(datetime(), level, format(... args), flat(record));
    }
  }

  warn(... args: unknown[]): void {
    if (this.loglevel > LogLevel.WARN) { return; }
    const level = styleText(['white', 'bgYellow'], '[WARN]', { stream: process.stderr });
    const record = load() ?? {};
    if (is_empty(record)) {
      console.error(datetime(), level, format(... args));
    } else {
      console.error(datetime(), level, format(... args), flat(record));
    }
  }

  error(... args: unknown[]): void {
    if (this.loglevel > LogLevel.ERROR) { return; }
    const level = styleText(['white', 'bgRed'], '[ERROR]', { stream: process.stderr });
    const record = load() ?? {};
    if (is_empty(record)) {
      console.error(datetime(), level, format(... args));
    } else {
      console.error(datetime(), level, format(... args), flat(record));
    }
  }

  fatal(... args: unknown[]): void {
    if (this.loglevel > LogLevel.FATAL) { return; }
    const level = styleText(['white', 'bgRed', 'bold'], '[FATAL]', { stream: process.stderr });
    const record = load() ?? {};
    if (is_empty(record)) {
      console.error(datetime(), level, format(... args));
    } else {
      console.error(datetime(), level, format(... args), flat(record));
    }
  }
}

let secret: Logger = new NoopLogger();
export const registerLogger = (logger: Logger): void => {
  secret = logger;
};

export const logger = {
  trace: (... args: unknown[]): void => {
    secret.trace(... args);
  },
  debug: (... args: unknown[]): void => {
    secret.debug(... args);
  },
  info: (... args: unknown[]): void => {
    secret.info(... args);
  },
  warn: (... args: unknown[]): void => {
    secret.warn(... args);
  },
  error: (... args: unknown[]): void => {
    secret.error(... args);
  },
  fatal: (... args: unknown[]): void => {
    secret.fatal(... args);
  },
} as const;
