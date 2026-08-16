import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, Text } from '@/components/ui';
import { colors, motion, radius } from '@/theme';

export type ConfirmationPanelProps = {
  title: string;
  body: string;
  /** The generated reference number, e.g. "NYC-2026-4181". */
  reference: string;
};

/** The full-screen success state after an application is submitted. */
export function ConfirmationPanel({ title, body, reference }: ConfirmationPanelProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(motion.fadeSlow)}
      // Grouped so a screen reader announces the outcome as one statement.
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${body}. Reference ${reference}`}
      style={styles.container}>
      <View style={styles.check}>
        <Icon name="check" size={34} color={colors.paper} />
      </View>

      <Text variant="confirmTitle" align="center">
        {title}
      </Text>
      <Text variant="body" color="muted" align="center">
        {body}
      </Text>

      <View style={styles.reference}>
        <Text variant="bodySm" mono tabular color="navy">
          {reference}
        </Text>
      </View>
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
