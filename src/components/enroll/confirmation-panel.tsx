import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { colors, motion, radius } from '@/theme';

export type ConfirmationPanelProps = {
  title: string;
  body: string;
  /** The generated reference, e.g. "NYC-2026-4181". Ours, not the agency's. */
  reference: string;
  /** Names what the reference is. Without it the number reads as an agency confirmation. */
  referenceLabel?: string;
  /** The caveat under it, for the same reason. */
  referenceNote?: string;
};

/**
 * The state after answers are saved — which is not the same as an application being submitted.
 *
 * The tick is deliberately gone. A large green check over a reference number is the visual
 * vocabulary of "your application is in", and this app cannot file anything: no agency has seen
 * these answers. Someone scanning the screen without reading it would take the tick as the
 * outcome, which is exactly the misreading that costs a household a benefit they qualified for.
 */
export function ConfirmationPanel({
  title,
  body,
  reference,
  referenceLabel,
  referenceNote,
}: ConfirmationPanelProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(motion.fadeSlow)}
      // Grouped so a screen reader announces the outcome as one statement — including the caveat,
      // so it is never heard as a bare confirmation number.
      accessible
      accessibilityRole="summary"
      accessibilityLabel={[title, body, referenceLabel, reference, referenceNote]
        .filter(Boolean)
        .join('. ')}
      style={styles.container}>
      <View style={styles.check}>
        <Icon name="document" size={34} color={colors.paper} />
      </View>

      <Text variant="confirmTitle" align="center">
        {title}
      </Text>
      <Text variant="body" color="muted" align="center">
        {body}
      </Text>

      <View style={styles.reference}>
        {referenceLabel ? (
          <Text variant="caption" color="muted" align="center">
            {referenceLabel}
          </Text>
        ) : null}
        <Text variant="bodySm" mono tabular color="navy">
          {reference}
        </Text>
      </View>

      {referenceNote ? (
        <Text variant="caption" color="muted" align="center">
          {referenceNote}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    backgroundColor: colors.paper,
  },
  check: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  reference: {
    backgroundColor: colors.offWhite,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
});
