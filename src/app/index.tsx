import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors } from '@/theme';

/**
 * Placeholder route.
 *
 * The component library in src/components lives here without any screens mounting it yet —
 * see docs/design/README.md for the ten screens still to be assembled.
 */
export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <Text variant="screenTitle">Enroll NYC</Text>
      <Text variant="bodySm" color="muted" align="center">
        Component library in progress. No screens are wired up yet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    backgroundColor: colors.offWhite,
  },
});
