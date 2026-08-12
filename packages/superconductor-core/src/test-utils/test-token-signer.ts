import crypto from 'crypto';

export class TestTokenSigner {
  private secret: string;

  constructor(secret: string = 'test-secret') {
    this.secret = secret;
  }

  sign(payload: string): string {
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  verify(payload: string, token: string): boolean {
    const expected = this.sign(payload);
    return expected === token;
  }
}
