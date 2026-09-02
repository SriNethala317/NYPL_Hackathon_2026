import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { NycLockup } from './nyc-lockup';

import { Button, Icon, Text } from '@/components/ui';
import { colors, layout, radius } from '@/theme';

export type AppLockProps = {
  title: string;
  body: string;
  action: string;
  onUnlock: () => void;
};

/**
 * A device-level lock in front of the app — Face ID, Touch ID, or the device passcode.
 *
 * Scope, stated plainly: this gates *access on this device*. It is not authentication and it is
 * not encryption. It stops someone who picks up an unlocked phone from reading benefit details;
 * it does nothing about data at rest or in transit.
 *
 * Real accounts, and the row-level scoping that goes with them, arrive with Supabase. When state
 * starts persisting between launches this must be paired with `expo-secure-store`, or the lock
 * becomes decoration over a readable store.
 */
export function AppLock({ title, body, action, onUnlock }: AppLockProps) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  const authenticate = useCallback(async () => {
    setFailed(false);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: title,
      // Falling back to the device passcode matters: plenty of people have no biometrics
      // enrolled, and locking them out entirely would be worse than not locking at all.
      disableDeviceFallback: false,
      cancelLabel: action,
    });
    if (result.success) onUnlock();
    else setFailed(true);
  }, [action, onUnlock, title]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Web has no local authentication, and a simulator often has no enrolled biometrics.
      // Neither should be able to lock a user out of their own application.
      if (Platform.OS === 'web') {
        if (!cancelled) setAvailable(false);
        return;
      }
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (cancelled) return;

      const usable = hasHardware && enrolled;
      setAvailable(usable);
      if (usable) void authenticate();
    })();

    return () => {
      cancelled = true;
    };
  }, [authenticate]);

  // Resolve open rather than closed. A lock that cannot verify anyone is a denial of service,
  // and there is nothing secret behind it yet.
  useEffect(() => {
    if (available === false) onUnlock();
  }, [available, onUnlock]);

  if (available !== true) return null;

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <NycLockup variant="header" />

        <View style={styles.icon}>
          <Icon name="lock" size={26} color={colors.navy} />
        </View>

        <Text variant="cardTitle" align="center">
          {title}
        </Text>
        <Text variant="bodySm" color="muted" align="center">
          {body}
        </Text>

        {failed ? (
          <Button label={action} size="md" fullWidth={false} onPress={authenticate} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPaddingX,
  },
  content: {
    alignItems: 'center',
    gap: 12,
    maxWidth: 320,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
});
