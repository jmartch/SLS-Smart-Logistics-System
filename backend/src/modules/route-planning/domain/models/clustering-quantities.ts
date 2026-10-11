import { InvalidClusteringInputError } from './invalid-clustering-input.error';

const KG_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const M3_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;

export function parseKgToGrams(kgStr: string, allowZero = true): number {
    if (typeof kgStr !== 'string') {
        throw new InvalidClusteringInputError('INVALID_QUANTITY_FORMAT');
    }
    const trimmed = kgStr.trim();
    if (!KG_DECIMAL_PATTERN.test(trimmed)) {
        throw new InvalidClusteringInputError('INVALID_QUANTITY_FORMAT');
    }

    const [intPart, decPart = ''] = trimmed.split('.');
    const paddedDec = decPart.padEnd(3, '0');
    const grams = Number(intPart) * 1000 + Number(paddedDec);

    if (!Number.isSafeInteger(grams)) {
        throw new InvalidClusteringInputError('INTEGER_OVERFLOW');
    }
    if (!allowZero && grams === 0) {
        throw new InvalidClusteringInputError('NEGATIVE_QUANTITY');
    }
    return grams;
}

export function parseM3ToCm3(m3Str: string, allowZero = true): number {
    if (typeof m3Str !== 'string') {
        throw new InvalidClusteringInputError('INVALID_QUANTITY_FORMAT');
    }
    const trimmed = m3Str.trim();
    if (!M3_DECIMAL_PATTERN.test(trimmed)) {
        throw new InvalidClusteringInputError('INVALID_QUANTITY_FORMAT');
    }

    const [intPart, decPart = ''] = trimmed.split('.');
    const paddedDec = decPart.padEnd(6, '0');
    const cm3 = Number(intPart) * 1000000 + Number(paddedDec);

    if (!Number.isSafeInteger(cm3)) {
        throw new InvalidClusteringInputError('INTEGER_OVERFLOW');
    }
    if (!allowZero && cm3 === 0) {
        throw new InvalidClusteringInputError('NEGATIVE_QUANTITY');
    }
    return cm3;
}

export function gramsToKg(grams: number): string {
    if (!Number.isSafeInteger(grams) || grams < 0) {
        throw new InvalidClusteringInputError('INTEGER_OVERFLOW');
    }
    const intPart = Math.floor(grams / 1000);
    const decPart = (grams % 1000).toString().padStart(3, '0');
    return `${intPart}.${decPart}`;
}

export function cm3ToM3(cm3: number): string {
    if (!Number.isSafeInteger(cm3) || cm3 < 0) {
        throw new InvalidClusteringInputError('INTEGER_OVERFLOW');
    }
    const intPart = Math.floor(cm3 / 1000000);
    const decPart = (cm3 % 1000000).toString().padStart(6, '0');
    return `${intPart}.${decPart}`;
}