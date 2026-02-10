import { enableProdMode } from '@angular/core';

import { getLocaleForInitialization, Locale, UILanguage } from '~/utils/locale';

describe('getLocaleForInitialization', () => {
  beforeAll(() => {
    enableProdMode();
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
      },
      writable: true,
    });
  });

  it('should throw an error when an invalid default locale is passed in', () => {
    expect(() => {
      getLocaleForInitialization({
        defaultLocale: 'nonsense',
        urlLocale: 'en-GB',
      });
    }).toThrow('Invalid default locale "nonsense" found in environment.');
  });

  it('should throw an error when an invalid url locale is passed in', () => {
    expect(() => {
      getLocaleForInitialization({
        defaultLocale: 'en-GB',
        urlLocale: 'nonsense',
      });
    }).toThrow('Invalid locale "nonsense" found in URL:');
  });

  it('should default to the urlLocale whenever there is weirdness saved in local storage', () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue('nonsense');

    const localeInfo = getLocaleForInitialization({
      defaultLocale: 'en-GB',
      urlLocale: UILanguage.nl,
    });

    expect(localeInfo).toEqual({ locale: Locale.nl });
  });

  it('should use the default locale when there is nothing saved in local storage', () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue(null);

    let localeInfo = getLocaleForInitialization({
      defaultLocale: 'en-GB',
      urlLocale: 'en-GB',
    });

    expect(localeInfo).toEqual({ locale: Locale.en });

    localeInfo = getLocaleForInitialization({
      defaultLocale: UILanguage.nl,
      urlLocale: UILanguage.nl,
    });

    expect(localeInfo).toEqual({ locale: Locale.nl });
  });

  it('should prompt to change language when the local storage locale is out of sync with the url locale', () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue(UILanguage.nl);

    const localeInfo = getLocaleForInitialization({
      defaultLocale: 'en-GB',
      urlLocale: 'en-GB',
    });

    expect(localeInfo).toEqual({
      localStorageLocale: Locale.nl,
      localeIsOutOfSyncWithUrl: true,
    });
  });

  it('should prompt to change language when the local storage locale does not exist and the url locale does not match the default locale', () => {
    (window.localStorage.getItem as jest.Mock).mockReturnValue(null);

    const localeInfo = getLocaleForInitialization({
      defaultLocale: UILanguage.nl,
      urlLocale: 'en-GB',
    });

    expect(localeInfo).toEqual({
      localStorageLocale: Locale.nl,
      localeIsOutOfSyncWithUrl: true,
    });
  });
});
