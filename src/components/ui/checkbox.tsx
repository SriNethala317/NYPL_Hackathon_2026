import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';

import { Icon } from './icon';

import { colors, layout } from '@/theme';

export type CheckboxProps = Omit<PressableProps, 'style'> & {
  checked: boolean;
  /** The accessible name. Pair it with the visible copy sitting beside the box. */
  label: string;
};

/**
 * A 24pt box that grows to a 44pt touch target through `hitSlop` rather than padding, so it
 * still lines up with the first line of the consent text beside it.
 */
export function Checkbox({ checked, label, ...rest }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      hitSlop={(layout.minTarget - SIZE) / 2}
      style={({ pressed }) => [
        styles.box,
        checked ? styles.boxChecked : styles.boxUnchecked,
        pressed && styles.pressed,
      ]}
      {...rest}>
      {checked ? (
        <View style={styles.check}>
          <Icon name="check" size={15} color={colors.paper} />
        </View>
      ) : null}
    </Pressable>
  );
}

const SIZE = 24;

const styles = StyleSheet.create({
  box: {
    width: SIZE,
    height: SIZE,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxUnchecked: {
    backgroundColor: colors.paper,
    borderWidth: layout.borderWidth,
    borderColor: colors.border,
  },
  boxChecked: {
    backgroundColor: colors.navy,
  },
  check: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
