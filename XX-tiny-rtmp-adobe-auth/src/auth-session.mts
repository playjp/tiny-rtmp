import crypto, { randomBytes } from 'node:crypto';

import { AuthResult } from '../../01-tiny-rtmp-server/src/rtmp-accepter.mts';
import type { AuthResultWithDescription, AuthConfiguration } from '../../01-tiny-rtmp-server/src/rtmp-accepter.mts';

const MAX_SESSIONS = 1000; // MEMO: アプリケーション変数
const SESSION_EXPIRES = 60 * 1000; // MEMO: アプリケーション変数

export type AdobeAuthSessionInformation = {
  salt: Buffer;
  challenge: Buffer;
  timeoutId: NodeJS.Timeout;
};

export default class AdobeAuthSession implements AuthConfiguration {
  private passwordFn: (user: string) => Promise<string | null> | (string | null);
  private sessions = new Map<string, AdobeAuthSessionInformation>();
  private lock = new Set<string>();

  constructor(passwordFn: (user: string) => Promise<string | null> | (string | null)) {
    this.passwordFn = passwordFn;
  }

  public async connect(app: string, query?: Record<string, string>): Promise<AuthResultWithDescription> {
    const { user, authmod, challenge, opaque, response } = query ?? {};
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

  public publish(app: string, stream: string): [authResult: (typeof AuthResult)[keyof typeof AuthResult], description: string | null] {
    const key = `${app}/${stream}`;
    if (this.lock.has(key)) { return [ AuthResult.DISCONNECT, null ]; }
    this.lock.add(key);
    return [AuthResult.OK, null];
  }

  public keepalive(): typeof AuthResult.OK | typeof AuthResult.DISCONNECT {
    return AuthResult.OK;
  }

  public disconnect(app: string, stream: string): void {
    const key = `${app}/${stream}`;
    this.lock.delete(key);
  }

  private query(user: string): string {
    // Map は 挿入順 で走査できるので、古い順で取り出せる
    for (const [key, session] of this.sessions) {
      if (this.sessions.size < MAX_SESSIONS) { break; }
      clearTimeout(session.timeoutId);
      this.sessions.delete(key);
    }

    const challenge = randomBytes(4);
    const challenge_base64 = challenge.toString('base64');
    const salt = randomBytes(4);
    const session = {
      salt,
      challenge,
      timeoutId: setTimeout(() => {
        this.sessions.delete(challenge_base64);
      }, SESSION_EXPIRES),
    } satisfies AdobeAuthSessionInformation;
    this.sessions.set(challenge_base64, session);

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
    clearTimeout(session.timeoutId);
    this.sessions.delete(opaque);
    const password = await this.passwordFn(user);
    if (password == null) { return false; }

    // なんでハッシュ化したパスワードじゃなくて生パスワードなんだろうね...
    const firststep = crypto.createHash('md5').update(user).update(session.salt.toString('base64')).update(password).digest('base64');
    // 上述の通り、正しいのは challenge を使う方なので challenge を用いる
    const secondstep = crypto.createHash('md5').update(firststep).update(session.challenge.toString('base64')).update(challenge).digest('base64');
    return response === secondstep;
  }
}
