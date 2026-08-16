import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppHeader } from './app-header';
import type { Language } from './language-pill';

import { colors, layout } from '@/theme';

export type TabScreenProps = {
  title: string;
  language: Language;
  /** Localized announcement for the language toggle. */
  switchLabel: string;
  onToggleLanguage?: () => void;
  children: ReactNode;
};

/**
 * The shared frame for the three tabs: fixed header, scrolling body.
 *
 * The bottom padding is `tabBarClearance`, without which the last card slides under the
 * floating glass bar. Content is width-capped and centred so it stays readable on tablets and
 * web, where the design's phone layout would otherwise stretch.
 */
export function TabScreen({ title, language, switchLabel, onToggleLanguage, children }: TabScreenProps) {
  return (
    <View style={styles.root}>
      <AppHeader
        title={title}
        language={language}
        switchLabel={switchLabel}
        onToggleLanguage={onToggleLanguage}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.offWhite,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 18,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: layout.tabBarClearance,
  },
  body: {
    flex: 1,
    gap: 14,
    maxWidth: layout.maxContentWidth,
  },
});
