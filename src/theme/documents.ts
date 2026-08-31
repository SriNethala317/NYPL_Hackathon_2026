import { colors } from './tokens';

/**
 * Documents are tinted by what they *prove*, not by which file they are.
 *
 * A passport and an IDNYC card both prove identity, so they share a tint. This is what lets the
 * registry stay open — a new document type picks up its colour from its category instead of
 * needing a palette entry of its own.
 */

export type DocumentCategory = 'identity' | 'immigration' | 'income' | 'residence' | 'other';

/** Render order in Profile: identity first, because nothing else is accepted without it. */
export const documentCategories: readonly DocumentCategory[] = [
  'identity',
  'immigration',
  'income',
  'residence',
  'other',
] as const;

type DocumentTint = {
  /** Thumbnail fill once the document has been read. */
  surface: string;
  /** The 135° stripe drawn over it. */
  stripe: string;
};

export const documentTints = {
  identity: { surface: '#EEEEF8', stripe: '#DCDCEF' },
  immigration: { surface: '#EAF0FB', stripe: '#D6E2F5' },
  income: { surface: colors.greenTint, stripe: '#D3EEDE' },
  residence: { surface: '#E7F3FC', stripe: '#D2E8F8' },
  other: { surface: colors.amberTint, stripe: '#F7E7C4' },
} as const satisfies Record<DocumentCategory, DocumentTint>;

/** A document still being read, or one that failed, shows a flat neutral tile. */
export const emptyDocumentTint = {
  surface: colors.offWhite,
  stripe: 'transparent',
} as const;
