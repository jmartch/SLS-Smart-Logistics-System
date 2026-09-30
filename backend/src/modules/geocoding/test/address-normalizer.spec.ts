import { AddressNormalizer } from '../domain/address-normalizer';
import { InvalidAddressError } from '../domain/invalid-address.error';

describe('AddressNormalizer', () => {
    const normalizer = new AddressNormalizer();

    it.each(['Calle 80 # 53-67', ' calle   80   #   53 - 67 ', 'CL 80 # 53-67'])(
        'normalizes equivalent street addresses: %s',
        (input) => {
            expect(normalizer.normalize(input)).toEqual({
                normalizedText: 'CALLE 80 # 53-67',
                components: {
                    streetType: 'CALLE',
                    streetIdentifier: '80',
                    generatingRoad: '53',
                    plateNumber: '67',
                    neighborhood: null,
                },
            });
        },
    );

    it.each(['Carrera 53 # 80-67', 'CRA 53 # 80-67', 'KR 53 # 80-67'])(
        'normalizes equivalent avenue addresses: %s',
        (input) => {
            expect(normalizer.normalize(input)).toEqual({
                normalizedText: 'CARRERA 53 # 80-67',
                components: {
                    streetType: 'CARRERA',
                    streetIdentifier: '53',
                    generatingRoad: '80',
                    plateNumber: '67',
                    neighborhood: null,
                },
            });
        },
    );

    it('rejects an empty address with a stable code', () => {
        expect.assertions(2);

        try {
            normalizer.normalize('   ');
        } catch (error) {
            expect(error).toBeInstanceOf(InvalidAddressError);
            expect(error).toMatchObject({
                code: 'EMPTY_ADDRESS',
            });
        }
    });

    it.each(['CALLE 80', '53-67', 'ALTO PRADO'])(
        'rejects unsupported formats: %s',
        (input) => {
            expect.assertions(2);

            try {
                normalizer.normalize(input);
            } catch (error) {
                expect(error).toBeInstanceOf(InvalidAddressError);
                expect(error).toMatchObject({
                    code: 'UNSUPPORTED_ADDRESS_FORMAT',
                });
            }
        },
    );
});
