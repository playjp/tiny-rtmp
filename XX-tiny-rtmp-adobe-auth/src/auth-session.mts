import crypto, { randomBytes } from 'node:crypto';

import { AuthResult } from '../../01-tiny-rtmp-server/src/rtmp-session.mts';
import type { AuthResultWithDescription, AuthConfiguration } from '../../01-tiny-rtmp-server/src/rtmp-session.mts';

export type AdobeAuthSessionInformation = {
  salt: Buffer;
  challenge: Buffer;
  opaque: Buffer;
};

export default class AdobeAuthSession implements AuthConfiguration {
  private passwordFn: (user: string) => Promise<string | null> | (string | null);
  private sessions = new Map<string, AdobeAuthSessionInformation>();

  constructor(passwordFn: (user: string) => Promise<string | null> | (string | null)) {
    this.passwordFn = passwordFn;
  }

  public async app(app: string): Promise<AuthResultWithDescription> {
    const query_index = app.indexOf('?');
    if (query_index < 0) {
      return [AuthResult.DISCONNECT, 'authmod=adobe code=403 need auth'];
    }
    // クエリパラメータをパース
    const appName = app.slice(0, query_index);
    const query = app.slice(query_index + 1).split('&').reduce((a, b) => {
      const index = b.indexOf('=');
      const key = index >= 0 ? b.slice(0, index) : b;
      const value = index >= 0 ? b.slice(index + 1) : '';
      return {
        ... a,
        [key]: value,
      };
    }, {}) as Record<string, string>;
    const { user, authmod, challenge, response } = query;
    // Adobe Auth でなければ切断 (authmod, user は必須)
    if (authmod !== 'adobe' || user == null) {
      return [AuthResult.DISCONNECT, null];
    }
    // Adobe Auth の第2段階だったら needauth を伝達して切断
    // (FFmpeg は切断してくるので、こちらから切断してエラーにならないようにする)
    if (response == null || challenge == null) {
      return [AuthResult.DISCONNECT, `authmod=adobe :?reason=needauth&${this.query(user)}&authmod=adobe`];
    }

    const accepted = await this.verify(user, response, challenge);
    return accepted ? [AuthResult.OK, null] : [AuthResult.DISCONNECT, 'authmod=adobe :?reason=authfailed'];
  }

  public streamKey(): [authResult: (typeof AuthResult)[keyof typeof AuthResult], description: string | null] {
    return [AuthResult.OK, null];
  }

  private query(user: string): string {
    const session = {
      salt: randomBytes(4),
      challenge: randomBytes(4),
      opaque: randomBytes(4), // MEMO: 用意するけど使わない
    } satisfies AdobeAuthSessionInformation;
    this.sessions.set(user, session);

    // opaque は送信すると FFmpeg が challenge より opaque を優先し、Wirecast は challenge を優先する、どっちか片方にすべき
    // 仕様上は challenge を用いることになっているので opaque を除外する
    return `user=${encodeURIComponent(user)}&salt=${session.salt.toString('base64')}&challenge=${session.challenge.toString('base64')}`;
  }

  private async verify(user: string, response: string, challenge: string): Promise<boolean> {
    const session = this.sessions.get(user);
    if (session == null) { return false; }
    const password = await this.passwordFn(user);
    if (password == null) { return false; }

    const firststep = crypto.createHash('md5').update(user).update(session.salt.toString('base64')).update(password).digest('base64');
    // FFmpeg は opaque を優先して使い opaque がない時に client challenge を使う... なんで???
    const secondstep = crypto.createHash('md5').update(firststep).update(session.challenge.toString('base64')).update(challenge).digest('base64');
    this.sessions.delete(user);
    return response === secondstep;
  }
}
