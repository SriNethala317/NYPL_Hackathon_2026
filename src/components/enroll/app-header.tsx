import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguagePill, type Language } from './language-pill';
import { NycLockup } from './nyc-lockup';

import { Text } from '@/components/ui';
import { colors, layout } from '@/theme';

export type AppHeaderProps = {
  /** "Your applications", "Programs for you", "Profile". */
  title: string;
  language: Language;
  /** Localized announcement for the language toggle, e.g. "Switch to Español". */
  switchLabel: string;
  onToggleLanguage?: () => void;
};

/**
 * The white chrome above every tab: lockup and language toggle on one row, screen title
 * below.
 *
 * The spec's 60pt top padding is the status bar inset written literally; here it comes from
 * the real safe area instead, so it's correct on every device and on Android.
 */
export function AppHeader({ title, language, switchLabel, onToggleLanguage }: AppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topRow}>
        <NycLockup variant="header" />
        <LanguagePill language={language} switchLabel={switchLabel} onPress={onToggleLanguage} />
      </View>
      <Text variant="screenTitle" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.paper,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 12,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
