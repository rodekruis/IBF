import { getLinguonym, UILanguage } from '~/utils/language';

describe('getLinguonym', () => {
  it('should return correct linguonym for valid language codes', () => {
    const result = getLinguonym({
      languageToDisplayNameOf: UILanguage.en,
      languageToShowNameIn: UILanguage.nl,
    });
    expect(result).toBe('Engels');
  });
});
