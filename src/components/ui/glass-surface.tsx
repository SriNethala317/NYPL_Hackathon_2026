import { BlurView } from 'expo-blur';
import { StyleSheet, View, type ViewProps } from 'react-native';

export type GlassSurfaceProps = ViewProps & {
  /** Corner radius. Passed explicitly because the blur layer has to clip to it. */
  radius?: number;
  /** Blur strength. */
  intensity?: number;
};

/**
 * The frosted backdrop behind the floating tab bar.
 *
 * A translucent fill sits under a blur layer, so the surface still reads as separate from the
 * content if the blur fails to paint (older Android, reduced-transparency settings).
 *
 * The design is drawn against iOS 26 liquid glass, which `expo-glass-effect` provides — but
 * that package has no build for this SDK, so this is the static approximation. If the project
 * moves back to a newer SDK, this component is the only place that has to change: swap in
 * `GlassView` behind an `isLiquidGlassAvailable()` check and every caller follows.
 */
export function GlassSurface({
  radius = 999,
  intensity = 60,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  return (
    <View style={[styles.surface, { borderRadius: radius }, style]} {...rest}>
      <BlurView
        intensity={intensity}
        tint="light"
        style={[styles.blur, { borderRadius: radius }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    // The spec's 0.5px highlight along the edge of the glass.
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    overflow: 'hidden',
  },
  blur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
