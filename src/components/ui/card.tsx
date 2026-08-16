import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, layout, radius } from '@/theme';

export type CardProps = ViewProps & {
  /** `card` (16) for rows and facts, `cardLg` (18) for application and empty-state cards. */
  size?: 'card' | 'cardLg';
  /**
   * A 4px left edge in the eligibility color, replacing the 1px border on that side. This is
   * what makes a program row's status readable while scanning the list.
   */
  accent?: string;
  bordered?: boolean;
};

/**
 * The white surface everything sits on. Cards are separated by a 1px border rather than a
 * shadow — only the floating tab bar lifts off the page.
 */
export function Card({
  size = 'card',
  accent,
  bordered = true,
  style,
  ...rest
}: CardProps) {
  return (
    <View
      style={[
        styles.base,
        { borderRadius: radius[size] },
        bordered && styles.bordered,
        accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.paper,
    overflow: 'hidden',
  },
  bordered: {
    borderWidth: layout.borderWidth,
    borderColor: colors.border,
  },
});
