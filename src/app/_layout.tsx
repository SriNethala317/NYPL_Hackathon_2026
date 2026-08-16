import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock, SplashPanel } from '@/components/enroll';
import { useStrings } from '@/i18n/use-strings';
import { AppStoreProvider } from '@/state/app-store';
import { motion } from '@/theme';

SplashScreen.preventAutoHideAsync();

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
      <AppStoreProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="confirmation" options={{ gestureEnabled: false }} />
        </Stack>
        <Splash />
        <Lock />
        <StatusBar style="dark" />
      </AppStoreProvider>
    </SafeAreaProvider>
  );
}

/**
 * The brand moment, overlaid on the navigator rather than routed.
 *
 * Keeping it out of the router means the tabs are already mounted behind it, so dismissing is
 * instant and there is no back-navigation into a splash screen.
 */
function Splash() {
  const strings = useStrings();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), motion.splash);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
      onPress={() => setVisible(false)}
      style={styles.splash}>
      <SplashPanel subtitle={[...strings.splash.agency]} badge={strings.splash.badge} />
    </Pressable>
  );
}

/**
 * The device lock sits above everything, including the splash, so nothing behind it is legible
 * before the user authenticates. It resolves open where local authentication is unavailable —
 * see `AppLock` for why locking someone out is worse than not locking.
 */
function Lock() {
  const strings = useStrings();
  const [locked, setLocked] = useState(true);

  if (!locked) return null;

  return (
    <AppLock
      title={strings.lock.title}
      body={strings.lock.body}
      action={strings.lock.action}
      onUnlock={() => setLocked(false)}
    />
  );
}

const styles = StyleSheet.create({
  splash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
