import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from './text';

import { colors, radius } from '@/theme';

export type BadgeProps = Omit<ViewProps, 'children'> & {
  label: string;
  surface?: string;
  color?: string;
  /** `badge` (8) for status chips, `pill` (999) for the language and reference pills. */
  shape?: 'badge' | 'pill';
  /**
   * Makes the badge a real button.
   *
   * A `View` with a touch handler is not one: assistive tech announces the role but the activate
   * action never fires, so a screen-reader user hears "button" and cannot press it. Passing this
   * switches to `Pressable` and pads the target out to 44pt.
   */
  onPress?: () => void;
};

/**
 * The small status chip: application stage on Home, Verified/Add in Profile, eligibility on
 * the program detail screen. Colors are passed in rather than derived, because the caller
 * already knows the status — see `eligibility` in src/theme for the standard pairs.
 */
export function Badge({
  label,
  surface = colors.navyTint,
  color = colors.navy,
  shape = 'badge',
  style,
  onPress,
  ...rest
}: BadgeProps) {
  const content = (
    <Text variant="badge" color={color}>
      {label}
    </Text>
  );
  const shell = [styles.base, { backgroundColor: surface, borderRadius: radius[shape] }, style];

  if (!onPress) {
    return (
      <View style={shell} {...rest}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      // The chip is ~26pt tall; hitSlop carries it to the 44pt minimum without changing the look.
      hitSlop={9}
      style={({ pressed }) => [...shell, pressed && styles.pressed]}
      {...rest}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pressed: {
    opacity: 0.7,
  },
});
