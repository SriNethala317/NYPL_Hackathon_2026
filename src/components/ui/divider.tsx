import { StyleSheet, View, type ViewProps } from 'react-native';

import { colors, layout } from '@/theme';

export type DividerProps = ViewProps & {
  /** `divider` separates rows inside a card; `border` separates a card from the page. */
  tone?: 'divider' | 'border';
  inset?: number;
};

export function Divider({ tone = 'divider', inset = 0, style, ...rest }: DividerProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.base, { backgroundColor: colors[tone], marginHorizontal: inset }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    height: layout.borderWidth,
    alignSelf: 'stretch',
  },
});
