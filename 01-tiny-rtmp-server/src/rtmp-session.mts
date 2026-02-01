import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type UpdatableRTMPSession =  Partial<{
  app: string;
  streamKey: string;
}>;

export type RTMPSession = UpdatableRTMPSession & {
  sessionId: string;
};

const session = new AsyncLocalStorage<RTMPSession>();

export const initialized = (): boolean => {
  return session.getStore() != null;
};

export const load = (): RTMPSession | null => {
  return session.getStore() ?? null;
};

export const store = (update: UpdatableRTMPSession) => {
  Object.assign(session.getStore() ?? {}, update);
};

export const run = <T>(cb: () => T): T => {
  const init = { sessionId: randomUUID() };
  return session.run(init, cb);
};
