import { isDevMode } from '@angular/core';

/////////////////////////////////////////////////////////////////////////
// Locale and Language related types and functions
/////////////////////////////////////////////////////////////////////////

// NOTE: The enum and types in this blocks are back-end in 121. Since in the current version of code they are only used in the front-end, they are moved here.

/**
 * Supported languages for the User Interface.
 * See: https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes
 * Make sure to use the 2-letter code from the "Set 1"-column.
 */
export enum UILanguage {
  en = 'en',
  nl = 'nl',
}

type Language = UILanguage;

/**
 * Example:
 * {
 *   ar: 'مرحبا'
 *   en: 'Hello',
 *   nl: 'Hallo',
 * };
 *
 * TLanguage can be either RegistrationPreferredLanguage or UILanguage.
 *
 * We use Partial<...> here because translations will often be "incomplete" aka:
 * not have a string for each language.
 */
type Translation<TLanguage extends Language> = Partial<
  Record<TLanguage, string>
>;

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
export type UILanguageTranslation = Translation<UILanguage>;

/////////////////////////////////////////////////////////////////////////
// Locale and Language related types and functions
/////////////////////////////////////////////////////////////////////////

/**
 * "locale" in this file always refers to Angular locale IDs, e.g. "en-GB",
 * "fr", "nl", etc.
 *
 * We convert these into UILanguage values where we communicate through the
 * browser or emails we send to users of the portal.
 *
 * Registrations have a preferredLanguage field which we do **not** convert to
 * UILanguage values.
 */

// TODO: rename this to selectedLocale. Will require a migration.
const LOCAL_STORAGE_LOCALE_KEY = 'preferredLanguage';

// NOTE: Make sure to align these languages with ALL_AVAILABLE_LOCALES in '_all_available-locales.mjs'
export enum Locale {
  en = 'en-GB', // this has to be en-GB otherwise angular locale stuff doesn't work
  nl = 'nl',
}

const localeToUILanguageMap: Record<Locale, UILanguage> = {
  [Locale.en]: UILanguage.en,
  [Locale.nl]: UILanguage.nl,
};

/**
 * @param {string} locale - Angular locale id
 * @return {string} UILanguage
 */
export const getUILanguageFromLocale = (locale: Locale): UILanguage =>
  localeToUILanguageMap[locale];

const isValidLocale = (locale: string): locale is Locale =>
  Object.values(Locale).includes(locale as Locale);

export const getLocaleForInitialization = ({
  defaultLocale,
  urlLocale,
}: {
  defaultLocale: string;
  urlLocale: string;
}):
  | {
      locale: Locale;
      localeIsOutOfSyncWithUrl?: false;
    }
  | {
      localStorageLocale: Locale;
      localeIsOutOfSyncWithUrl: true;
    } => {
  if (!isValidLocale(defaultLocale)) {
    // This should never happen, but it could be set incorrectly in ENV variables
    throw new Error(
      `Invalid default locale "${defaultLocale}" found in environment.`,
    );
  }

  if (isDevMode()) {
    return { locale: defaultLocale };
  }

  if (!isValidLocale(urlLocale)) {
    // This should never happen, as the server cannot serve a page with an invalid locale
    // Mainly throwing this error to make TS know that urlLocale is a valid Locale from now on
    throw new Error(
      `Invalid locale "${urlLocale}" found in URL: ${window.location.pathname}`,
    );
  }

  const localStorageLocale =
    localStorage.getItem(LOCAL_STORAGE_LOCALE_KEY) ?? defaultLocale;

  if (!isValidLocale(localStorageLocale)) {
    // This in theory should never happen
    // But to be on the safe side, we revert to locale in URL
    localStorage.setItem(LOCAL_STORAGE_LOCALE_KEY, urlLocale);
    return { locale: urlLocale };
  }

  if (urlLocale !== localStorageLocale) {
    return {
      localStorageLocale,
      localeIsOutOfSyncWithUrl: true,
    };
  }

  return { locale: localStorageLocale };
};

/**
 * Changes the locale in localStorage and redirects to the URL with the desired
 * locale.
 *
 * @param {string} desiredLocale - Angular locale id
 */
export const changeLocale = (desiredLocale: Locale): void => {
  // persist locale in locale storage
  localStorage.setItem(LOCAL_STORAGE_LOCALE_KEY, desiredLocale);

  // redirect to desired locale
  const pathnameArray = window.location.pathname.split('/');
  pathnameArray[1] = desiredLocale;
  window.location.pathname = pathnameArray.join('/');
};
