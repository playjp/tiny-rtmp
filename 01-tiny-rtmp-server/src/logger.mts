import { inspect, styleText } from 'node:util';

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
  trace(message: string, record?: Record<string, unknown>): void;
  debug(message: string, record?: Record<string, unknown>): void;
  info(message: string, record?: Record<string, unknown>): void;
  warn(message: string, record?: Record<string, unknown>): void;
  error(message: string, record?: Record<string, unknown>): void;
  fatal(message: string, record?: Record<string, unknown>): void;
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
  if (obj === undefined) { return ''; }
  return inspect(obj, {
    depth: Number.POSITIVE_INFINITY,
    breakLength: Number.POSITIVE_INFINITY,
    compact: true,
  });
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

  trace(message: string, record?: Record<string, unknown>): void {
    if (this.loglevel > LogLevel.TRACE) { return; }
    const level = styleText(['gray', 'bgBlack', 'dim'], '[TRACE]', { stream: process.stderr });
    record = { ... (load() ?? {}),  ... (record ?? {}) };
    if (is_empty(record)) {
      console.error(datetime(), level, message);
    } else {
      console.error(datetime(), level, message, flat(record));
    }
  }

  debug(message: string, record?: Record<string, unknown>): void {
    if (this.loglevel > LogLevel.DEBUG) { return; }
    const level = styleText(['gray', 'bgBlack'], '[DEBUG]', { stream: process.stderr });
    record = { ... (load() ?? {}),  ... (record ?? {}) };
    if (is_empty(record)) {
      console.error(datetime(), level, message);
    } else {
      console.error(datetime(), level, message, flat(record));
    }
  }

  info(message: string, record?: Record<string, unknown>): void {
    if (this.loglevel > LogLevel.INFO) { return; }
    const level = styleText(['white', 'bgBlack'], '[INFO]', { stream: process.stderr });
    record = { ... (load() ?? {}),  ... (record ?? {}) };
    if (is_empty(record)) {
      console.error(datetime(), level, message);
    } else {
      console.error(datetime(), level, message, flat(record));
    }
  }

  warn(message: string, record?: Record<string, unknown>): void {
    if (this.loglevel > LogLevel.WARN) { return; }
    const level = styleText(['white', 'bgYellow'], '[WARN]', { stream: process.stderr });
    record = { ... (load() ?? {}),  ... (record ?? {}) };
    if (is_empty(record)) {
      console.error(datetime(), level, message);
    } else {
      console.error(datetime(), level, message, flat(record));
    }
  }

  error(message: string, record?: Record<string, unknown>): void {
    if (this.loglevel > LogLevel.ERROR) { return; }
    const level = styleText(['white', 'bgRed'], '[ERROR]', { stream: process.stderr });
    record = { ... (load() ?? {}),  ... (record ?? {}) };
    if (is_empty(record)) {
      console.error(datetime(), level, message);
    } else {
      console.error(datetime(), level, message, flat(record));
    }
  }

  fatal(message: string, record?: Record<string, unknown>): void {
    if (this.loglevel > LogLevel.FATAL) { return; }
    const level = styleText(['white', 'bgRed', 'bold'], '[FATAL]', { stream: process.stderr });
    record = { ... (load() ?? {}),  ... (record ?? {}) };
    if (is_empty(record)) {
      console.error(datetime(), level, message);
    } else {
      console.error(datetime(), level, message, flat(record));
    }
  }
}

let secret: Logger = new NoopLogger();
export const registerLogger = (logger: Logger): void => {
  secret = logger;
};

export const logger = {
  trace: (message: string, record?: Record<string, unknown>): void => {
    secret.trace(message, record);
  },
  debug: (message: string, record?: Record<string, unknown>): void => {
    secret.debug(message, record);
  },
  info: (message: string, record?: Record<string, unknown>): void => {
    secret.info(message, record);
  },
  warn: (message: string, record?: Record<string, unknown>): void => {
    secret.warn(message, record);
  },
  error: (message: string, record?: Record<string, unknown>): void => {
    secret.error(message, record);
  },
  fatal: (message: string, record?: Record<string, unknown>): void => {
    secret.fatal(message, record);
  },
} as const;
