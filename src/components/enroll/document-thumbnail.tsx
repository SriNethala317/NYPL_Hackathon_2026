import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { colors, documentTints, emptyDocumentTint, layout, radius, type DocumentKind } from '@/theme';

export type DocumentThumbnailSize = 'sm' | 'md' | 'lg';

export type DocumentThumbnailProps = {
  kind: DocumentKind;
  /** `sm` in the review attachment list, `md` in Profile, `lg` in the scanning sheet. */
  size?: DocumentThumbnailSize;
  /** An unverified document shows a flat neutral tile with no stripes. */
  verified?: boolean;
};

/**
 * The striped page placeholder standing in for a real document preview.
 *
 * In production the uploaded file's first page replaces the stripes; the per-type tint stays,
 * since that's what makes the five Profile rows scannable at a glance.
 */
export function DocumentThumbnail({
  kind,
  size = 'md',
  verified = true,
}: DocumentThumbnailProps) {
  const tint = verified ? documentTints[kind] : emptyDocumentTint;

  return (
    <View
      // Purely decorative — the row's label and status already carry the meaning.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, sizeStyles[size], { backgroundColor: tint.surface }]}>
      {verified ? (
        <LinearGradient
          colors={stripeColors(tint.surface, tint.stripe)}
          locations={STRIPE_LOCATIONS}
          // 135°, matching the spec's diagonal.
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.stripes}
        />
      ) : null}
    </View>
  );
}

/**
 * Four hard-edged diagonal bands. Each color repeats across a pair of identical stops, which
 * is what makes the gradient step instead of blend — a smooth ramp would read as a shadow
 * rather than as stripes.
 */
const STRIPE_LOCATIONS = [0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1] as const;

function stripeColors(surface: string, stripe: string) {
  return [surface, surface, stripe, stripe, surface, surface, stripe, stripe] as const;
}

const sizeStyles = StyleSheet.create({
  sm: { width: 34, height: 26 },
  md: { width: 54, height: 40 },
  lg: { width: 92, height: 68 },
});

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.thumbnail,
    borderWidth: layout.borderWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stripes: {
    flex: 1,
  },
});
