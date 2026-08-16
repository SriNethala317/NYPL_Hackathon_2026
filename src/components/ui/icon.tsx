import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

import { colors } from '@/theme';

/**
 * Every glyph the app uses, named by role.
 *
 * SF Symbols are iOS-only in this SDK — `SymbolView` takes a single SF name and renders its
 * `fallback` on Android and web — so each entry carries a Material equivalent too. Screens
 * never branch on `Platform.OS`; they just ask for a role.
 *
 * The handoff draws its glyphs out of plain boxes and says to swap them for the project's
 * icon set, which is this.
 */
const glyphs = {
  home: { ios: 'house', material: 'home' },
  enrollment: { ios: 'list.bullet', material: 'list' },
  profile: { ios: 'person', material: 'person' },
  camera: { ios: 'camera', material: 'photo-camera' },
  document: { ios: 'doc', material: 'description' },
  lock: { ios: 'lock', material: 'lock' },
  chevronRight: { ios: 'chevron.right', material: 'chevron-right' },
  back: { ios: 'chevron.left', material: 'chevron-left' },
  check: { ios: 'checkmark', material: 'check' },
  plus: { ios: 'plus', material: 'add' },
} as const satisfies Record<string, { ios: SFSymbol; material: MaterialIconName }>;

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

export type IconName = keyof typeof glyphs;

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  /**
   * Icons are decorative by default — the adjacent label already carries the meaning. Set
   * this only on an icon-only control, where it becomes the accessible name.
   */
  label?: string;
};

export function Icon({ name, size = 22, color = colors.navy, label }: IconProps) {
  const glyph = glyphs[name];

  return (
    <SymbolView
      name={glyph.ios}
      size={size}
      tintColor={color}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      fallback={<MaterialIcons name={glyph.material} size={size} color={color} />}
    />
  );
}
