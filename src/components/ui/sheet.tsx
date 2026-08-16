import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, motion, radius, scrim } from '@/theme';

export type SheetProps = {
  visible: boolean;
  /** Fires on scrim tap and on Android back. Wire it to whatever owns `visible`. */
  onRequestClose: () => void;
  children: ReactNode;
  /** Announced when the sheet opens. */
  label?: string;
};

const sheetEasing = Easing.bezier(...motion.sheetBezier);

/**
 * The bottom sheet shell — scrim, slide-up, grabber, rounded top. It owns presentation only;
 * what goes inside (the upload options, the scanning state) is the caller's business.
 *
 * Rendered in a `Modal` so it sits above the tab bar and picks up the Android back button for
 * free, with Reanimated driving the entry so the spec's easing curve survives intact.
 */
export function Sheet({ visible, onRequestClose, children, label }: SheetProps) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onRequestClose}>
      <View style={styles.root}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onRequestClose}
          entering={FadeIn.duration(motion.fadeFast)}
          exiting={FadeOut.duration(motion.fadeFast)}
          style={styles.scrim}
        />
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          entering={SlideInDown.duration(motion.sheet).easing(sheetEasing)}
          exiting={SlideOutDown.duration(motion.sheet).easing(sheetEasing)}
          style={[styles.sheet, { paddingBottom: 34 + insets.bottom }]}>
          <View style={styles.grabber} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: scrim,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: 12,
    paddingHorizontal: 20,
    gap: 18,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
});
