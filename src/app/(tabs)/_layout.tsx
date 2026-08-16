import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';

import { TabBar, type TabItem, type TabKey } from '@/components/enroll';
import { useStrings } from '@/i18n/use-strings';

/** Route name → the key the design's tab bar uses. */
const routeToKey: Record<string, TabKey> = {
  index: 'home',
  enrollment: 'enroll',
  profile: 'profile',
};

const keyToRoute: Record<TabKey, string> = {
  home: 'index',
  enroll: 'enrollment',
  profile: 'profile',
};

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="enrollment" />
      <Tabs.Screen name="profile" />
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
