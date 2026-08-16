import { dictionaries, type Strings } from './strings';

import { useAppStore } from '@/state/app-store';

/** The active dictionary. Every screen pulls its copy from here rather than inlining text. */
export function useStrings(): Strings {
  const { language } = useAppStore();
  return dictionaries[language];
}

export { fill } from './strings';
export type { Language, Strings } from './strings';
