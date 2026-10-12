import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { PublicTrackingTokenGenerator } from '../application/ports/public-tracking-token.port';

/** 32 bytes aleatorios criptográficos (256 bits) en base64url: 43 caracteres. */
@Injectable()
export class CryptoPublicTrackingTokenGenerator implements PublicTrackingTokenGenerator {
    generate(): string {
        return randomBytes(32).toString('base64url');
    }
}
