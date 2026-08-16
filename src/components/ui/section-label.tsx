import { StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from './text';

export type SectionLabelProps = ViewProps & {
  label: string;
  /** Eligibility accent for the Enrollment group headings. Omit for plain sections. */
  dotColor?: string;
};

/**
 * "YOUR DOCUMENTS", "YOU MAY QUALIFY". Uppercasing happens here rather than in the copy, so
 * translated strings stay readable in the source and in screen readers.
 */
export function SectionLabel({ label, dotColor, style, ...rest }: SectionLabelProps) {
  return (
    <View accessibilityRole="header" style={[styles.container, style]} {...rest}>
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Text variant="sectionLabel" color="muted">
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
