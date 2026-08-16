import { StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from './text';

import { colors, radius } from '@/theme';

export type BadgeProps = Omit<ViewProps, 'children'> & {
  label: string;
  surface?: string;
  color?: string;
  /** `badge` (8) for status chips, `pill` (999) for the language and reference pills. */
  shape?: 'badge' | 'pill';
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
  ...rest
}: BadgeProps) {
  return (
    <View
      style={[styles.base, { backgroundColor: surface, borderRadius: radius[shape] }, style]}
      {...rest}>
      <Text variant="badge" color={color}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
