import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync();

/**
 * Minimal root layout — enough to boot the app while the component library is built out.
 *
 * The real navigator (three tabs plus a stack for detail/form/review/confirm) lands with the
 * functional layer. The design's tab bar is a custom floating glass pill, so it will be a
 * `TabList`/`TabSlot` tree rendering `<TabBar />` rather than the platform tab bar.
 */
export default function RootLayout() {
  // Loaded here rather than only through the app.json config plugin: plugins don't apply in
  // Expo Go, and this is the one font the design can't approximate.
  const [fontsLoaded, fontError] = useFonts({
    'ArchivoBlack-Regular': require('@/assets/fonts/ArchivoBlack-Regular.ttf'),
  });

  useEffect(() => {
    // Hide on error too — a missing wordmark font is not worth blocking the app on.
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
