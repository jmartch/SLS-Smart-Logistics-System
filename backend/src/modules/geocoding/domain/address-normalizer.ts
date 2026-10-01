import { InvalidAddressError } from './invalid-address.error';
import { NormalizedAddress } from './geocoding.types';

const ADDRESS_PATTERN =
    /^(CALLE|CL|CARRERA|CRA|KR)\s+([A-Z0-9]+)\s*#\s*([A-Z0-9]+)\s*-\s*([A-Z0-9]+)$/;

export class AddressNormalizer {
    normalize(originalText: string): NormalizedAddress {
        const preparedText = originalText
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ' ');

        if (preparedText.length === 0) {
            throw new InvalidAddressError(
                'EMPTY_ADDRESS',
                'Address must not be empty',
            );
        }

        const match = ADDRESS_PATTERN.exec(preparedText);

        if (!match) {
            throw new InvalidAddressError(
                'UNSUPPORTED_ADDRESS_FORMAT',
                'Address format is not supported',
            );
        }

        const [, streetTypeAlias, streetIdentifier, generatingRoad, plateNumber] =
            match;

        const streetType =
            streetTypeAlias === 'CALLE' || streetTypeAlias === 'CL'
                ? 'CALLE'
                : 'CARRERA';

        return {
            normalizedText:
                `${streetType} ${streetIdentifier} ` +
                `# ${generatingRoad}-${plateNumber}`,
            components: {
                streetType,
                streetIdentifier,
                generatingRoad,
                plateNumber,
                neighborhood: null,
            },
        };
    }
}
