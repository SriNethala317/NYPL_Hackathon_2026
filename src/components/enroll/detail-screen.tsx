import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BackHeader } from './back-header';
import { StickyFooter } from './sticky-footer';

import { colors, layout } from '@/theme';

export type DetailScreenProps = {
  /** Back control copy — "Back" on pushed screens, "Edit" coming out of Review. */
  backLabel: string;
  onBack: () => void;
  /** Optional title beside the back control. */
  title?: string;
  /** Vertical rhythm between children. Screens differ here and nothing else. */
  gap?: number;
  /** Pinned actions. Omit for screens that only read. */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * The shared frame for pushed screens: back header, scrolling body, optional pinned footer.
 *
 * Counterpart to `TabScreen`. Program detail, the application form, review and privacy were each
 * carrying their own copy of the same root/content/body StyleSheet and the same JSX skeleton;
 * four copies of a layout is four places for it to drift.
 */
export function DetailScreen({
  backLabel,
  onBack,
  title,
  gap = 12,
  footer,
  children,
}: DetailScreenProps) {
  return (
    <View style={styles.root}>
      <BackHeader label={backLabel} title={title} onPress={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.body, { gap }]}>{children}</View>
      </ScrollView>

      {footer ? <StickyFooter>{footer}</StickyFooter> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.offWhite,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 18,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 40,
  },
  // Width-capped and centred so the phone layout stays readable on tablet and web.
  body: {
    flex: 1,
    maxWidth: layout.maxContentWidth,
  },
});
