import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout } from '@/theme';

export type StickyFooterProps = {
  children: ReactNode;
};

/**
 * The pinned action bar on pushed screens — "Start application", "Review application",
 * "Submit application".
 *
 * Opaque rather than glass: unlike the tab bar it sits over a form, and a translucent strip
 * behind a submit button reads as unfinished rather than layered.
 */
export function StickyFooter({ children }: StickyFooterProps) {
  const insets = useSafeAreaInsets();

  return <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>{children}</View>;
}

const styles = StyleSheet.create({
  footer: {
    backgroundColor: colors.paper,
    borderTopWidth: layout.borderWidth,
    borderTopColor: colors.border,
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 14,
    gap: 8,
  },
});
