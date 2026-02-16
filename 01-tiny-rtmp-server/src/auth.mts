export const AuthResult = {
  OK: 'OK',
  RETRY: 'RETRY',
  DISCONNECT: 'DISCONNECT',
} as const;
export const strip_query = (value: string): string => {
  const query_index = value.indexOf('?');
  if (query_index < 0) { return value; }
  return value.slice(0, query_index);
};
export const collect_query = (value: string): Record<string, string> | undefined => {
  const query_index = value.indexOf('?');
  if (query_index < 0) { return undefined; }
  return value.slice(query_index + 1).split('&').reduce((a, b) => {
    const index = b.indexOf('=');
    const key = index >= 0 ? b.slice(0, index) : b;
    const value = index >= 0 ? b.slice(index + 1) : '';
    return {
      ... a,
      [key]: value,
    };
  }, {}) as Record<string, string>;
};
const generate_lock_key = (app: string, stream: string): string => `${app}/${stream}`;
type MaybePromise<T,> = T | Promise<T>;
export type AuthResultWithDescription = [authResult: (typeof AuthResult)[keyof typeof AuthResult], description: string | null];
export interface AuthConfiguration {
  connect(app: string, query?: Record<string, string>): MaybePromise<AuthResultWithDescription>;
  publish(app: string, key: string, query?: Record<string, string>): MaybePromise<AuthResultWithDescription>;
  keepalive(app: string, key: string, query?: Record<string, string>): MaybePromise<typeof AuthResult.OK | typeof AuthResult.DISCONNECT>;
  disconnect(app: string, key: string, query?: Record<string, string>): MaybePromise<void>;
};
export const AuthConfiguration = {
  noAuth(): AuthConfiguration {
    const lock = new Set<ReturnType<typeof generate_lock_key>>();
    return {
      connect: () => [AuthResult.OK, null],
      publish: (app: string, key: string) => {
        if (lock.has(generate_lock_key(app, key))) { return [AuthResult.DISCONNECT, null]; }
        lock.add(generate_lock_key(app, key));
        return [AuthResult.OK, null];
      },
      keepalive: () => AuthResult.OK,
      disconnect: (app: string, key: string) => {
        lock.delete(generate_lock_key(app, key));
      },
    };
  },
  simpleAuth(appName: string, streamKey: string): AuthConfiguration {
    const lock = new Set<ReturnType<typeof generate_lock_key>>();
    return {
      connect: (app: string) => [app === appName ? AuthResult.OK : AuthResult.DISCONNECT, null],
      publish: (app: string, key: string) => {
        if (key !== streamKey) { return [AuthResult.DISCONNECT, null]; }
        if (lock.has(generate_lock_key(app, key))) { return [AuthResult.DISCONNECT, null]; }
        lock.add(generate_lock_key(app, key));
        return [AuthResult.OK, null];
      },
      keepalive: () => AuthResult.OK,
      disconnect: (app: string, key: string) => {
        lock.delete(generate_lock_key(app, key));
      },
    };
  },
  customAuth(
    connectFn: ((app: string, query?: Record<string, string>) => (boolean | Promise<boolean>)) | null,
    publishFn: ((app: string, key: string, query?: Record<string, string>) => (boolean | Promise<boolean>)) | null,
    keepaliveFn: ((app: string, key: string, query?: Record<string, string>) => (boolean | Promise<boolean>)) | null,
    disconnectFn: ((app: string, key: string, query?: Record<string, string>) => (void | Promise<void>)) | null
  ): AuthConfiguration {
    const lock = new Set<ReturnType<typeof generate_lock_key>>();
    return {
      connect: async (app: string, query?: Record<string, string>) => [(await (connectFn?.(app, query)) ?? true) ? AuthResult.OK : AuthResult.DISCONNECT, null],
      publish: async (app: string, key: string, query?: Record<string, string>) => {
        const ok = await (publishFn?.(app, key, query)) ?? true;
        if (!ok) { return [AuthResult.DISCONNECT, null]; }
        if (lock.has(generate_lock_key(app, key))) { return [AuthResult.DISCONNECT, null]; }
        lock.add(generate_lock_key(app, key));
        return [AuthResult.OK, null];
      },
      keepalive: async (app: string, key: string, query?: Record<string, string>) => (await (keepaliveFn?.(app, key, query)) ?? true) ? AuthResult.OK : AuthResult.DISCONNECT,
      disconnect: async (app: string, key: string, query?: Record<string, string>) => {
        try {
          await disconnectFn?.(app, key, query);
        } finally {
          lock.delete(generate_lock_key(app, key));
        }
      },
    };
  },
};
