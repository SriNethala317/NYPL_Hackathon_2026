import { StyleSheet } from 'react-native';

import { Card, Checkbox, Text } from '@/components/ui';

export type ConsentRowProps = {
  checked: boolean;
  onToggle?: () => void;
  /** The certification statement. Localized, so it comes from the caller. */
  children: string;
};

/**
 * The certify-and-authorize checkbox at the foot of the application form.
 *
 * The copy is not wrapped in the pressable: this is a legal attestation, so the tap target is
 * deliberately the box alone rather than the whole card.
 */
export function ConsentRow({ checked, onToggle, children }: ConsentRowProps) {
  return (
    <Card style={styles.card}>
      <Checkbox checked={checked} onPress={onToggle} label={children} />
      <Text variant="labelRegular" color="muted" style={styles.copy}>
        {children}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
  },
  copy: {
    flex: 1,
  },
});
