/**
 * Eligibility status → color, in one place.
 *
 * The same three statuses drive four different visual treatments across three screens: the
 * group heading dot on Enrollment, the 4px left border on a program row, the status badge on
 * the program detail screen, and the color of a program row's meta line. Keeping them in one
 * map is what stops those from drifting apart.
 *
 * Group headings ("YOU MAY QUALIFY") are localized strings, so they live with the copy, not
 * here — this map is purely visual.
 */

import { colors } from './tokens';

export type EligibilityStatus = 'yes' | 'more' | 'no';

type EligibilityPalette = {
  /** Group dot and the program row's left border. */
  accent: string;
  badgeSurface: string;
  badgeText: string;
  /** The meta line under a program blurb. */
  meta: string;
};

export const eligibility = {
  /** Ready to apply. */
  yes: {
    accent: colors.green,
    badgeSurface: colors.greenTint,
    badgeText: colors.greenText,
    meta: colors.green,
  },
  /** Eligible, but a document is missing. */
  more: {
    accent: colors.amber,
    badgeSurface: colors.amberTint,
    badgeText: colors.amberText,
    // Amber itself fails contrast on white, so the darker amberText carries the copy.
    meta: colors.amberText,
  },
  /** Over an income limit, or otherwise ruled out. */
  no: {
    accent: colors.muted,
    badgeSurface: colors.offWhite,
    badgeText: colors.muted,
    meta: colors.muted,
  },
} as const satisfies Record<EligibilityStatus, EligibilityPalette>;
