import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors } from '@/theme';

export type StageTrackerProps = {
  /** Localized stage names, in order — typically Submitted → In review → Decision. */
  labels: string[];
  /** Zero-based index of the stage reached. `0` means only the first stage is complete. */
  stage: number;
  /**
   * Localized progress announcement, e.g. "Stage 2 of 3: In review". Supplied by the caller
   * because building it here would hardcode English into a screen reader's output.
   */
  announcement?: string;
};

/**
 * The progress rail on an application card.
 *
 * Each stage owns a dot plus the connector trailing it, so the columns stay equal width and
 * the labels sit flush under their own dot no matter how long the translated names get.
 */
export function StageTracker({ labels, stage, announcement }: StageTrackerProps) {
  const current = labels[stage];

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={
        announcement ?? `Stage ${stage + 1} of ${labels.length}${current ? `: ${current}` : ''}`
      }
      style={styles.container}>
      <View style={styles.rail}>
        {labels.map((label, index) => {
          const reached = index <= stage;
          // The connector belongs to this stage but takes the *next* stage's color, so the
          // navy line stops exactly at the last dot the applicant has reached.
          const connectorReached = index + 1 <= stage;

          return (
            <Fragment key={label}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: reached ? colors.navy : colors.border },
                ]}
              />
              <View
                style={[
                  styles.connector,
                  { backgroundColor: connectorReached ? colors.navy : colors.border },
                ]}
              />
            </Fragment>
          );
        })}
      </View>

      <View style={styles.labels}>
        {labels.map((label, index) => (
          <Text
            key={label}
            variant="micro"
            color={index <= stage ? 'navy' : 'disabled'}
            style={styles.label}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  connector: {
    flex: 1,
    height: 2,
  },
  labels: {
    flexDirection: 'row',
  },
  label: {
    flex: 1,
  },
});
