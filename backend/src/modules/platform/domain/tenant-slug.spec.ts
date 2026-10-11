import { slugify, TENANT_SLUG_PATTERN } from './tenant-slug';

describe('slugify', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(slugify('Mensajeria Rapida SAS')).toBe('mensajeria-rapida-sas');
  });

  it('strips accents and diacritics', () => {
    expect(slugify('Logística Ñandú Barranquilla')).toBe(
      'logistica-nandu-barranquilla',
    );
  });

  it('collapses symbols and repeated separators into one hyphen', () => {
    expect(slugify('Envios & Co. -- (Norte)!!')).toBe('envios-co-norte');
  });

  it('trims leading and trailing separators and whitespace', () => {
    expect(slugify('  --Express 24/7--  ')).toBe('express-24-7');
  });

  it('keeps digits', () => {
    expect(slugify('Ruta 66')).toBe('ruta-66');
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('')).toBe('');
  });

  it('always produces a value matching the database slug pattern', () => {
    for (const name of [
      'Mensajeria Rapida SAS',
      'Logística Ñandú',
      'Envios & Co. -- (Norte)!!',
      'A',
      '9 9 9',
    ]) {
      expect(slugify(name)).toMatch(TENANT_SLUG_PATTERN);
    }
  });
});
