import crypto, { randomBytes } from 'node:crypto';

export type AdobeAuthSessionInformation = {
  salt: Buffer;
  challenge: Buffer;
  opaque: Buffer;
};

export default class AdobeAuthSession {
  private user: string;
  private password: string;
  private session: AdobeAuthSessionInformation | null = null;

  constructor(user: string, password: string) {
    this.user = user;
    this.password = password;
  }

  public query(): string {
    this.session = {
      salt: randomBytes(4),
      challenge: randomBytes(4),
      opaque: randomBytes(4), // MEMO: 用意するけど使わない
    };
    // opaque は送信すると FFmpeg が challenge より opaque を優先し、Wirecast は challenge を優先する、どっちか片方にすべき
    // 仕様上は challenge を用いることになっているので opaque を除外する
    return `user=${encodeURIComponent(this.user)}&salt=${this.session.salt.toString('base64')}&challenge=${this.session.challenge.toString('base64')}`;
  }

  public verify(response: string, challenge: string): boolean {
    if (this.session == null) { return false; }
    const firststep = crypto.createHash('md5').update(this.user).update(this.session.salt.toString('base64')).update(this.password).digest('base64');
    // FFmpeg は opaque を優先して使い opaque がない時に client challenge を使う... なんで???
    const secondstep = crypto.createHash('md5').update(firststep).update(this.session.challenge.toString('base64')).update(challenge).digest('base64');
    return response === secondstep;
  }

  public end(): void {
    this.session = null;
  }

  public toString(): string {
    return JSON.stringify(this.session);
  }
}
