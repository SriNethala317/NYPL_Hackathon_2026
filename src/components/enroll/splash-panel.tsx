import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { NycLockup } from './nyc-lockup';

import { Text } from '@/components/ui';
import { colors, motion, onNavy, radius } from '@/theme';

export type SplashPanelProps = {
  /** Two lines under "Enroll" — the agency name. */
  subtitle?: string[];
  /** The attribution pill at the foot of the screen. */
  badge?: string;
};

/**
 * The opening brand moment: full-bleed navy, lockup centered, attribution pinned to the foot.
 *
 * Presentational only — how long it stays up and what dismisses it belongs to the screen that
 * mounts it. The spec's timing is in `motion.splash`.
 */
export function SplashPanel({
  subtitle = ['Human Resources', 'Administration'],
  badge,
}: SplashPanelProps) {
  return (
    <Animated.View entering={FadeIn.duration(motion.fadeSlow)} style={styles.container}>
      <View style={styles.center}>
        <NycLockup variant="splash" subtitle={subtitle} />
      </View>

      {badge ? (
        <View style={styles.badge}>
          <View style={styles.dot} />
          <Text variant="badge" color={onNavy.badgeText}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  // Centers the lockup in the full screen, leaving the badge pinned below it.
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: onNavy.badgeSurface,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
    marginBottom: 54,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
});
