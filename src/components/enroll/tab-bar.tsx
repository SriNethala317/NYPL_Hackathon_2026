import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface, Icon, Text, type IconName } from '@/components/ui';
import { colors, motion, radius, shadow } from '@/theme';

export type TabKey = 'home' | 'enroll' | 'profile';

export type TabItem = {
  key: TabKey;
  /** Localized — the label changes with the language toggle. */
  label: string;
  icon: IconName;
};

export type TabBarProps = {
  items: TabItem[];
  activeKey: TabKey;
  onSelect?: (key: TabKey) => void;
};

/**
 * The floating liquid-glass tab bar.
 *
 * Absolutely positioned over the scroll region rather than docked below it, which is why
 * screens pad their content by `layout.tabBarClearance` — otherwise the last card slides
 * under the glass.
 */
export function TabBar({ items, activeKey, onSelect }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <GlassSurface
      radius={radius.pill}
      style={[styles.bar, { bottom: Math.max(insets.bottom, 26) }]}>
      {items.map((item) => (
        <TabBarItem
          key={item.key}
          item={item}
          active={item.key === activeKey}
          onPress={() => onSelect?.(item.key)}
        />
      ))}
    </GlassSurface>
  );
}

type TabBarItemProps = {
  item: TabItem;
  active: boolean;
  onPress: () => void;
};

function TabBarItem({ item, active, onPress }: TabBarItemProps) {
  const pillStyle = useAnimatedStyle(
    () => ({
      backgroundColor: withTiming(active ? ACTIVE_SURFACE : IDLE_SURFACE, {
        duration: motion.fadeFast,
      }),
    }),
    [active],
  );

  const tint = active ? colors.navy : colors.muted;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={item.label}
      onPress={onPress}
      style={styles.itemPressable}>
      <Animated.View style={[styles.item, active && styles.itemActive, pillStyle]}>
        <Icon name={item.icon} size={22} color={tint} />
        <Text variant="micro" color={tint}>
          {item.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const ACTIVE_SURFACE = 'rgba(255, 255, 255, 0.78)';
/** Fully transparent white, not `transparent` — so the fade doesn't interpolate through black. */
const IDLE_SURFACE = 'rgba(255, 255, 255, 0)';

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 4,
    boxShadow: shadow.tabBar,
  },
  itemPressable: {
    flex: 1,
  },
  item: {
    height: 58,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  itemActive: {
    boxShadow: shadow.activeTab,
  },
});
