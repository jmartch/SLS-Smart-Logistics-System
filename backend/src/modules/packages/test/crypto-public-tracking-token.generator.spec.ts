import { CryptoPublicTrackingTokenGenerator } from '../infrastructure/crypto-public-tracking-token.generator';

describe('CryptoPublicTrackingTokenGenerator', () => {
    const generator = new CryptoPublicTrackingTokenGenerator();

    it('produces 256-bit base64url tokens', () => {
        const token = generator.generate();

        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('does not repeat tokens', () => {
        const tokens = new Set(
            Array.from({ length: 1000 }, () => generator.generate()),
        );

        expect(tokens.size).toBe(1000);
    });
});
