import { ParseArrayPipe } from '@nestjs/common';

describe('SeedController – countryCodes parsing', () => {
  const pipe = new ParseArrayPipe({ items: String, optional: true });

  it('should parse comma-separated string into array', async () => {
    const result = await pipe.transform('MWI,UGA', {
      type: 'query',
      metatype: Array,
      data: 'countryCodes',
    });
    expect(result).toEqual(['MWI', 'UGA']);
  });

  it('should parse single value into array', async () => {
    const result = await pipe.transform('MWI', {
      type: 'query',
      metatype: Array,
      data: 'countryCodes',
    });
    expect(result).toEqual(['MWI']);
  });

  it('should pass through an already-parsed array', async () => {
    const result = await pipe.transform(['MWI', 'UGA'], {
      type: 'query',
      metatype: Array,
      data: 'countryCodes',
    });
    expect(result).toEqual(['MWI', 'UGA']);
  });

  it('should return undefined when value is undefined', async () => {
    const result = await pipe.transform(undefined, {
      type: 'query',
      metatype: Array,
      data: 'countryCodes',
    });
    expect(result).toBeUndefined();
  });
});
