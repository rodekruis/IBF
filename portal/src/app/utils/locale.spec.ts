import { enableProdMode } from '@angular/core';

import { getLocaleForInitialization } from '~/utils/locale';

describe('getLocaleForInitialization', () => {
  beforeEach(() => {
    enableProdMode();
  });

  it('should throw an error when an invalid default locale is passed in', () => {
    expect(() => {
      getLocaleForInitialization({
        defaultLocale: 'nonsense',
        urlLocale: 'en-GB',
      });
    }).toThrowError('Invalid default locale "nonsense" found in environment.');
  });

  it('should throw an error when an invalid url locale is passed in', () => {
    expect(() => {
      getLocaleForInitialization({
        defaultLocale: 'en-GB',
        urlLocale: 'nonsense',
      });
    }).toThrowError('Invalid locale "nonsense" found in URL: /context.html');
  });
});
