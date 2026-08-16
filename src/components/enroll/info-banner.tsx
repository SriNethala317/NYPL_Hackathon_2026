import { StyleSheet, View, type ViewProps } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius } from '@/theme';

export type InfoBannerProps = ViewProps & {
  children: string;
};

/**
 * The navy-tinted notice at the top of the application form, telling the applicant their
 * answers were prefilled from their documents and should be checked.
 */
export function InfoBanner({ children, style, ...rest }: InfoBannerProps) {
  return (
    <View accessibilityRole="alert" style={[styles.banner, style]} {...rest}>
      <Text variant="labelRegular" color="navy">
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.navyTint,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
});
