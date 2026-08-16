/**
 * Enroll NYC design tokens.
 *
 * Transcribed from the "Design Tokens" section of docs/design/README.md. This is a single
 * fixed light palette — the app has no dark mode. Navy carries the identity; a screen uses
 * at most two accents.
 *
 * Every value here appears in the handoff. If you need a number that isn't in this file,
 * check the spec before inventing one.
 */

import { Platform } from 'react-native';

export const colors = {
  /** Primary. Headers, primary buttons, links. Text on navy is always `paper`. */
  navy: '#1B2E7F',
  /** Navy at rest for a disabled primary button. */
  navyDisabled: '#8F97C4',
  /** Tint behind info banners and stage badges. */
  navyTint: '#E8F4FB',

  ink: '#0D0D0D',
  paper: '#FFFFFF',
  /** App background, and neutral fills on white. */
  offWhite: '#F4F5F7',

  /** 1px card and input outlines. Cards use this instead of a shadow. */
  border: '#D6D8DE',
  /** Hairline between rows inside a card. Lighter than `border`. */
  divider: '#E9EAEE',

  muted: '#5A5F6B',
  disabled: '#9AA0AC',

  cyan: '#1E9BE0',

  green: '#00A550',
  greenText: '#00733A',
  greenTint: '#E4F6EC',

  /** Status only — never as a surface or button fill. */
  amber: '#F2B21B',
  amberText: '#8A6410',
  amberTint: '#FDF3DC',

  error: '#C0392B',
} as const;

/** Overlays used on the navy splash, where the palette above has no contrast. */
export const onNavy = {
  rule: 'rgba(255, 255, 255, 0.32)',
  subtext: 'rgba(255, 255, 255, 0.70)',
  badgeSurface: 'rgba(255, 255, 255, 0.12)',
  badgeText: 'rgba(255, 255, 255, 0.90)',
} as const;

/** Scrim behind the upload sheet. */
export const scrim = 'rgba(13, 13, 13, 0.45)';

export const radius = {
  /** Small tints and thumbnails. */
  sm: 5,
  badge: 8,
  thumbnail: 8,
  tile: 12,
  button: 14,
  /** Cards, banners, and content inside the sheet. */
  card: 16,
  /** Large cards — application cards, empty states. */
  cardLg: 18,
  /** Top corners of the upload sheet. */
  sheet: 24,
  /** Pills, and the floating tab bar. */
  pill: 999,
} as const;

export type FontWeight = '400' | '600' | '700';

export const fonts = {
  /**
   * The NYC wordmark only.
   *
   * Loaded at runtime by `useFonts` in src/app/_layout.tsx, which is what makes it work in
   * Expo Go — config plugins don't apply there, so the app.json `expo-font` entry alone would
   * leave the wordmark unstyled. The name matches the `useFonts` key exactly.
   *
   * `NycLockup` still falls back to the heaviest system weight if loading fails, which holds
   * the layout even though the letterforms differ.
   */
  display: 'ArchivoBlack-Regular',
  /** Everything else — San Francisco on iOS, Roboto on Android. */
  sans: Platform.select({ ios: 'system-ui', default: undefined }),
  /** Filenames and reference numbers. */
  mono: Platform.select({ ios: 'ui-monospace', android: 'monospace', default: 'monospace' }),
} as const;

type TypeStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  letterSpacing?: number;
};

/**
 * Type roles, named for where they're used rather than by size, so a screen reads as
 * intent. Sizes come straight from the spec: 11/12/13/14/15/16/17/19/22/26/28/76.
 */
export const typography = {
  /** Splash wordmark. Size-driven — `NycLockup` scales this for the 25px header variant. */
  wordmark: { fontSize: 76, lineHeight: 68, fontWeight: '400', letterSpacing: -3.5 },

  /** Screen titles under the header: "Your applications", "Programs for you". */
  screenTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6 },
  /** The program name on the detail screen. */
  programTitle: { fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.7 },
  /** "Application submitted". */
  confirmTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  /** "Check your answers before submitting". */
  reviewHeading: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  /** Empty-state and identity-card titles. */
  cardTitle: { fontSize: 19, lineHeight: 24, fontWeight: '700' },
  /** Program names in a list, document labels, application names. */
  rowTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700' },

  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  /** Button labels, document row labels, text inputs. */
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  /** Empty-state body copy. */
  bodySm: { fontSize: 15, lineHeight: 21, fontWeight: '400' },

  /** Field labels, consent copy, data-row values. */
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  /** Data-row labels, program blurbs. */
  labelRegular: { fontSize: 14, lineHeight: 20, fontWeight: '400' },

  /** Reference lines, footnotes, privacy notes. */
  meta: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  /** Program meta lines ("Benefit: 50% off subway & bus"). */
  metaStrong: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  /** "YOUR DOCUMENTS", "YOU MAY QUALIFY". Rendered uppercase by `SectionLabel`. */
  sectionLabel: { fontSize: 13, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6 },

  /** Field hints, button footnotes. */
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Badge text, and the splash "OFFICIAL CITY OF NEW YORK APP" pill. */
  badge: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.3 },
  /** Tab bar labels, stage tracker labels. */
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
} as const satisfies Record<string, TypeStyle>;

export type TypographyVariant = keyof typeof typography;

/**
 * Cards deliberately have no shadow — they use a 1px `border` instead. Only the floating
 * tab bar and its active pill lift off the page.
 *
 * Expressed as `boxShadow`, supported natively in React Native 0.86, so the spec's
 * two-layer tab bar shadow survives verbatim instead of being flattened to one layer.
 */
export const shadow = {
  tabBar: '0px 2px 10px rgba(13, 13, 13, 0.10), 0px 12px 30px rgba(13, 13, 13, 0.12)',
  activeTab: '0px 1px 3px rgba(13, 13, 13, 0.10)',
} as const;

/** Durations in ms. Easings are named for the RN Easing / Reanimated equivalents. */
export const motion = {
  fadeFast: 200,
  fadeSlow: 400,
  /** Stack push — matches the platform default, so screens rarely override it. */
  push: 240,
  sheet: 280,
  /** One pass of the cyan bar down the scanning placeholder. Loops. */
  scanSweep: 1000,
  /** How long the document sits in "Reading your document" before flipping to Verified. */
  scanDuration: 1700,
  splash: 2000,
  /** The sheet's slide-up curve, as Reanimated bezier args. */
  sheetBezier: [0.2, 0.9, 0.3, 1] as const,
} as const;

export const layout = {
  /** Horizontal padding for headers and scroll content. */
  screenPaddingX: 20,
  /** Bottom padding on scroll content so it clears the floating tab bar. */
  tabBarClearance: 104,
  /** Minimum touch target. Reach it with `hitSlop` when the visual target is smaller. */
  minTarget: 44,
  /** Keeps content readable on tablets and web. */
  maxContentWidth: 640,
  /** 1px, not hairline — the spec calls for a full point. */
  borderWidth: 1,
} as const;
