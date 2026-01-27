import crypto, { randomBytes } from 'node:crypto';
import { AuthResult, type AuthConfiguration } from './rtmp-session.mts';

export type AdobeAuthSessionInformation = {
  salt: Buffer;
  challenge: Buffer;
  opaque: Buffer;
};

export default class AdobeAuthSession implements AuthConfiguration {
  private user: string;
  private password: string;
  private session: AdobeAuthSessionInformation | null = null;

  constructor(user: string, password: string) {
    this.user = user;
    this.password = password;
  }

  public app(app: string): [authResult: (typeof AuthResult)[keyof typeof AuthResult], description: string | null] {
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
    const { authmod, challenge, response } = query;
    // Adobe Auth でなければ切断
    if (authmod !== 'adobe') {
      return [AuthResult.DISCONNECT, null];
    }
    // Adobe Auth の第2段階だったら needauth を伝達して切断
    // (FFmpeg は切断してくるので、こちらから切断してエラーにならないようにする)
    if (response == null || challenge == null) {
      return [AuthResult.DISCONNECT, `authmod=adobe :?reason=needauth&${this.query()}&authmod=adobe`];
    }

    const accepted = this.verify(response, challenge);
    this.end();

    return accepted ? [AuthResult.OK, null] : [AuthResult.DISCONNECT, 'authmod=adobe :?reason=authfailed'];
  }

  public streamKey(): [authResult: (typeof AuthResult)[keyof typeof AuthResult], description: string | null] {
    return [AuthResult.OK, null];
  }

  private query(): string {
    this.session = {
      salt: randomBytes(4),
      challenge: randomBytes(4),
      opaque: randomBytes(4), // MEMO: 用意するけど使わない
    };
    // opaque は送信すると FFmpeg が challenge より opaque を優先し、Wirecast は challenge を優先する、どっちか片方にすべき
    // 仕様上は challenge を用いることになっているので opaque を除外する
    return `user=${encodeURIComponent(this.user)}&salt=${this.session.salt.toString('base64')}&challenge=${this.session.challenge.toString('base64')}`;
  }

  private verify(response: string, challenge: string): boolean {
    if (this.session == null) { return false; }
    const firststep = crypto.createHash('md5').update(this.user).update(this.session.salt.toString('base64')).update(this.password).digest('base64');
    // FFmpeg は opaque を優先して使い opaque がない時に client challenge を使う... なんで???
    const secondstep = crypto.createHash('md5').update(firststep).update(this.session.challenge.toString('base64')).update(challenge).digest('base64');
    return response === secondstep;
  }

  private end(): void {
    this.session = null;
  }
}
