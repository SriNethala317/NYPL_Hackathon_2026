import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';

import { TabBar, type TabItem, type TabKey } from '@/components/enroll';
import { useStrings } from '@/i18n/use-strings';

/**
 * The Scan tab is a development surface, not part of the design.
 *
 * `docs/design/README.md` fixes three tabs, and this is a fourth that exists to try the extraction
 * pipeline against real documents before it is wired into the upload flow. `__DEV__` is true in
 * Expo Go — which is where that testing happens — and false in a release build, so the shipped app
 * keeps the three tabs the design specifies. Flip this constant to carry it into a build you hand
 * to somebody else.
 */
const SHOW_SCAN_TAB = __DEV__;

/** Route name → the key the design's tab bar uses. */
const routeToKey: Record<string, TabKey> = {
  index: 'home',
  enrollment: 'enroll',
  profile: 'profile',
  scan: 'scan',
};

const keyToRoute: Record<TabKey, string> = {
  home: 'index',
  enroll: 'enrollment',
  profile: 'profile',
  scan: 'scan',
};

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="enrollment" />
      <Tabs.Screen name="profile" />
      {/* Registered either way — expo-router routes by file — but hidden from the bar in release. */}
      <Tabs.Screen name="scan" options={{ href: SHOW_SCAN_TAB ? undefined : null }} />
    </Tabs>
  );
}

/**
 * Adapts react-navigation's tab state onto the design's floating glass bar.
 *
 * The bar is absolutely positioned, so it escapes the navigator's layout flow and genuinely
 * floats over the scroll region — which is why every screen pads its content by
 * `layout.tabBarClearance`.
 */
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const strings = useStrings();

  const items: TabItem[] = [
    { key: 'home', label: strings.tabs.home, icon: 'home' },
    { key: 'enroll', label: strings.tabs.enrollment, icon: 'enrollment' },
    { key: 'profile', label: strings.tabs.profile, icon: 'profile' },
    ...(SHOW_SCAN_TAB
      ? [{ key: 'scan' as const, label: strings.tabs.scan, icon: 'camera' as const }]
      : []),
  ];

  const activeRoute = state.routes[state.index]?.name ?? 'index';
  const activeKey = routeToKey[activeRoute] ?? 'home';

  return (
    <TabBar
      items={items}
      activeKey={activeKey}
      onSelect={(key) => {
        const route = keyToRoute[key];
        // Switching tabs pops any pushed screen back to the tab root, per the design.
        navigation.navigate(route);
      }}
    />
  );
}
