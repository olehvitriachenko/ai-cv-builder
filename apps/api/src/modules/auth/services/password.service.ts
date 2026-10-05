import { randomBytes } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/** Argon2id (library defaults) password hashing. */
@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string | null = null;

  /**
   * The dummy hash is computed once at startup (not lazily on the first failed login) so an
   * unknown-email login costs about the same as a real one from the very first request.
   */
  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(randomBytes(16).toString('hex'));
  }

  hash(password: string): Promise<string> {
    return hash(password);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  /** Spends the same work as a real verification and always reports failure. */
  async verifyDummy(password: string): Promise<false> {
    if (this.dummyHash === null) {
      throw new Error('PasswordService has not been initialised');
    }
    await verify(this.dummyHash, password);
    return false;
  }
}
