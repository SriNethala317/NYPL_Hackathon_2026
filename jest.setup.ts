/**
 * Test environment shims.
 *
 * Only native modules with no JS fallback are mocked. Anything that can run for real does,
 * so the tests exercise the actual component tree rather than a stack of stubs.
 */

// SF Symbols are a native view; render a plain box so layout still resolves.
jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return { SymbolView: View };
});

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('@expo/vector-icons/MaterialIcons', () => {
  const { View } = require('react-native');
  return View;
});

// Reanimated ships its own mock; layout animations are no-ops under it.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const { View } = require('react-native');
  return {
    SafeAreaProvider: View,
    SafeAreaView: View,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
