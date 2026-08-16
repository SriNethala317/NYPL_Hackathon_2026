/**
 * The five document types the app collects, and the tint each one's thumbnail uses.
 *
 * Thumbnails are striped placeholders standing in for a real page preview. In production the
 * uploaded file's first page replaces the stripes, but the tint stays — it's what makes the
 * five rows scannable at a glance in Profile.
 */

import { colors } from './tokens';

export type DocumentKind = 'id' | 'address' | 'income' | 'lease' | 'utility';

/** Render order in Profile and in the review screen's attachment list. */
export const documentKinds: readonly DocumentKind[] = [
  'id',
  'address',
  'income',
  'lease',
  'utility',
] as const;

type DocumentTint = {
  /** Thumbnail fill once the document is verified. */
  surface: string;
  /** The 135° stripe drawn over it. */
  stripe: string;
};

export const documentTints = {
  id: { surface: '#EEEEF8', stripe: '#DCDCEF' },
  address: { surface: '#E7F3FC', stripe: '#D2E8F8' },
  income: { surface: colors.greenTint, stripe: '#D3EEDE' },
  lease: { surface: '#F0F0F2', stripe: '#E3E3E7' },
  utility: { surface: colors.amberTint, stripe: '#F7E7C4' },
} as const satisfies Record<DocumentKind, DocumentTint>;

/** An unadded document shows a flat neutral tile with no stripes. */
export const emptyDocumentTint = {
  surface: colors.offWhite,
  stripe: 'transparent',
} as const;
