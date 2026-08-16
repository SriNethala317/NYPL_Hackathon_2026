import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, ConfirmationPanel, StickyFooter } from '@/components';
import { useStrings } from '@/i18n/use-strings';
import { colors } from '@/theme';

export default function ConfirmationScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const strings = useStrings();

  return (
    <View style={styles.root}>
      <ConfirmationPanel
        title={strings.confirmation.title}
        body={strings.confirmation.body}
        reference={reference}
      />

      <StickyFooter>
        <Button
          label={strings.confirmation.viewStatus}
          // `dismissTo` rather than push, so Home does not stack behind the confirmation.
          onPress={() => router.dismissTo('/')}
        />
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
});
