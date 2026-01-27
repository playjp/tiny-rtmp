import crypto, { randomBytes } from 'node:crypto';

import { AuthResult } from '../../01-tiny-rtmp-server/src/rtmp-session.mts';
import type { AuthResultWithDescription, AuthConfiguration } from '../../01-tiny-rtmp-server/src/rtmp-session.mts';

const MAX_SESSIONS = 1000;
export type AdobeAuthSessionInformation = {
  salt: Buffer;
  challenge: Buffer;
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
      // Adobe Auth を要求する
      // (FFmpeg は切断してくるので、こちらから切断してエラーにならないようにする)
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
    }, {}) as Record<string, string | undefined>;
    const { user, authmod, challenge, opaque, response } = query;
    // Adobe Auth でなければ Adobe Auth を要求して切断 (authmod, user は必須)
    // (FFmpeg は切断してくるので、こちらから切断してエラーにならないようにする)
    if (authmod !== 'adobe' || user == null) {
      return [AuthResult.DISCONNECT, 'authmod=adobe code=403 need auth'];
    }
    // Adobe Auth の第2段階だったら needauth を伝達して切断
    // (FFmpeg は切断してくるので、こちらから切断してエラーにならないようにする)
    if (response == null || challenge == null || opaque == null) {
      return [AuthResult.DISCONNECT, `authmod=adobe :?reason=needauth&${this.query(user)}&authmod=adobe`];
    }

    const accepted = await this.verify(user, response, challenge, opaque);
    return accepted ? [AuthResult.OK, null] : [AuthResult.DISCONNECT, 'authmod=adobe :?reason=authfailed'];
  }

  public streamKey(): [authResult: (typeof AuthResult)[keyof typeof AuthResult], description: string | null] {
    return [AuthResult.OK, null];
  }

  private query(user: string): string {
    // Map は 挿入順 で走査できるので、古い順で取り出せる
    while (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value!;
      this.sessions.delete(oldest);
    }

    const challenge = randomBytes(4);
    const challenge_base64 = challenge.toString('base64');
    const salt = randomBytes(4);
    this.sessions.set(challenge_base64, { salt, challenge } satisfies AdobeAuthSessionInformation);

    // FFmpeg (8.0.1) 内臓の Adobe Auth は response の計算に opaque があったら challenge の代わりに opaque を使う
    // Wirecast の Adobe Auth は response の計算に challenge を使う
    // 仕様上は challenge を用いることになっているが、実装的に揺れたりしている
    // FFmepg のコミットメッセージには opaque も challenge も実世界では同じ値 と言っている
    // なので opaque に challenge と同じ値を入れておけば、どっちが優先されようとも計算は同じ
    return Object.entries(({
      user,
      salt: salt.toString('base64'),
      challenge: challenge_base64,
      opaque: challenge_base64,
    })).map(([k, v]) => `${k}=${v}`).join('&');
  }

  private async verify(user: string, response: string, challenge: string, opaque: string): Promise<boolean> {
    const session = this.sessions.get(opaque);
    if (session == null) { return false; }
    this.sessions.delete(opaque);
    const password = await this.passwordFn(user);
    if (password == null) { return false; }

    const firststep = crypto.createHash('md5').update(user).update(session.salt.toString('base64')).update(password).digest('base64');
    // FFmpeg は opaque を優先して使い opaque がない時に client challenge を使う... なんで???
    const secondstep = crypto.createHash('md5').update(firststep).update(session.challenge.toString('base64')).update(challenge).digest('base64');
    return response === secondstep;
  }
}
