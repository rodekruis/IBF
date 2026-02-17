/**
 * Supported languages for the User Interface.
 * See: https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes
 * Make sure to use the 2-letter code from the "Set 1"-column.
 */
export enum UILanguage {
  en = 'en',
  nl = 'nl',
}

/**
 * An object that contains 0..n string translations for languages the UI
 * supports.
 *
 * The non-English UI languages will often be incompletely translated because
 * each time we add a string to the source language (English) it can take some
 * time for the translations of that string to be completed. This also means
 * that for any particular field of this type, some languages may be missing.
 * For the UI languages we prioritize the percentage of non-translated strings
 * will be low though.
 *
 * Example:
 * {
 *   ar: 'مرحبا',
 *   en: 'Hello',
 * };
 */
export type UILanguageTranslation = Partial<Record<UILanguage, string>>;

/**
 * Example: the linguonym of "English" in French:
 * getLinguonym({ languageToDisplayNameOf: 'en', languageToShowNameIn: 'fr' });
 * returns "anglais"
 */
export const getLinguonym = ({
  languageToDisplayNameOf,
  languageToShowNameIn,
}: {
  languageToDisplayNameOf: UILanguage;
  languageToShowNameIn: UILanguage;
}): string => {
  const names = new Intl.DisplayNames([languageToShowNameIn], {
    type: 'language',
  });
  // Unlikely but fallback to the language code itself.
  let possibleLinguonym: string | undefined;
  try {
    // The database can contain language codes that are not standard.
    // Calling this method with invalid input will produce a RangeError.
    // We catch this and fall back to the original language code, ex: 'et_AM'.
    possibleLinguonym = names.of(languageToDisplayNameOf);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error variable not needed.
  } catch (_) {
    // do nothing
  }
  return possibleLinguonym ?? languageToDisplayNameOf;
};
