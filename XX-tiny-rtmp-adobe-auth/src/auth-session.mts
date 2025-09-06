import crypto, { randomBytes } from "node:crypto";

export type AdobeAuthSessionInformation = {
  salt: Buffer;
  challenge: Buffer;
  opaque: Buffer;
}

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
      opaque: randomBytes(4),
    };
    return `user=${encodeURIComponent(this.user)}&salt=${this.session.salt.toString('hex')}&challenge=${this.session.challenge.toString('hex')}&opaque=${this.session.opaque.toString('hex')}`;
  }

  public verify(response: string, challenge: string): boolean {
    if (this.session == null) { return false; }
    const firststep = crypto.createHash('md5').update(this.user).update(this.session.salt.toString('hex')).update(this.password).digest('base64');
    // FFmpeg は opaque を優先して使い opaque がない時に client challenge を使う... なんで???
    const secondstep = crypto.createHash('md5').update(firststep).update(this.session.opaque.toString('hex')).update(challenge).digest('base64').replaceAll('=', '');
    return response === secondstep;
  }

  public end(): void {
    this.session = null;
  }

  public toString(): string {
    return JSON.stringify(this.session);
  }
}
