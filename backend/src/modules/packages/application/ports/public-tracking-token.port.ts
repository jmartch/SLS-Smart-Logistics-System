export interface PublicTrackingTokenGenerator {
    /** Devuelve un token público impredecible, único con altísima probabilidad. */
    generate(): string;
}
