import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { DocumentThumbnail } from './document-thumbnail';

import { Text } from '@/components/ui';
import { motion, type DocumentKind } from '@/theme';

export type ScanningIndicatorProps = {
  kind: DocumentKind;
  /** "Reading your document". */
  title: string;
  /** The document being read, e.g. "Pay stubs". */
  documentLabel: string;
};

/**
 * The reading-your-document state inside the upload sheet.
 *
 * The sweep is the only thing telling the applicant work is happening, so it runs on the UI
 * thread through Reanimated — a JS-driven loop would stutter exactly when the extraction work
 * it stands in for is busiest.
 */
export function ScanningIndicator({ kind, title, documentLabel }: ScanningIndicatorProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: motion.scanSweep, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: progress.value * (THUMBNAIL_HEIGHT + SWEEP_HEIGHT) - SWEEP_HEIGHT }],
  }));

  return (
    <View
      accessible
      // Announced as a live status rather than a static label, so the change is spoken.
      accessibilityRole="progressbar"
      accessibilityLabel={`${title}. ${documentLabel}`}
      style={styles.container}>
      <View style={styles.frame}>
        <DocumentThumbnail kind={kind} size="lg" />
        <Animated.View style={[styles.sweep, sweepStyle]}>
          <LinearGradient
            colors={SWEEP_COLORS}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.sweepFill}
          />
        </Animated.View>
      </View>

      <View style={styles.copy}>
        <Text variant="rowTitle" align="center">
          {title}
        </Text>
        <Text variant="labelRegular" color="muted" align="center">
          {documentLabel}
        </Text>
      </View>
    </View>
  );
}

/** Matches `DocumentThumbnail` at size `lg`. */
const THUMBNAIL_HEIGHT = 68;
const SWEEP_HEIGHT = 24;

/**
 * `colors.cyan` (#1E9BE0) at varying alpha, fading in and back out so the bar reads as a scan
 * line rather than a block sliding past. Written as rgba because a gradient needs the alpha
 * ramp that a flat token can't carry.
 */
const SWEEP_COLORS = [
  'rgba(30, 155, 224, 0)',
  'rgba(30, 155, 224, 0.55)',
  'rgba(30, 155, 224, 0)',
] as const;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  frame: {
    overflow: 'hidden',
    borderRadius: 8,
  },
  sweep: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SWEEP_HEIGHT,
  },
  sweepFill: {
    flex: 1,
  },
  copy: {
    gap: 4,
  },
});
