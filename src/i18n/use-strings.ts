import { dictionaries, fill, type Strings } from './strings';

import { useAppStore } from '@/state/app-store';

/** The active dictionary. Every screen pulls its copy from here rather than inlining text. */
export function useStrings(): Strings {
  const { language } = useAppStore();
  return dictionaries[language];
}

/**
 * The localized announcement for the language toggle, e.g. "Switch to Español".
 *
 * Lives here rather than in `LanguagePill` because the component is presentational and must not
 * reach into the store, and rather than in each screen because three of them need the same line.
 */
export function useLanguageSwitchLabel(): string {
  const { language } = useAppStore();
  const strings = dictionaries[language];
  return fill(strings.a11y.switchTo, {
    language: language === 'en' ? strings.a11y.spanish : strings.a11y.english,
  });
}

export { fill } from './strings';
export type { Language, Strings } from './strings';
