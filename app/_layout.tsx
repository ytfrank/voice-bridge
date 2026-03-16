/**
 * Root layout - sets up navigation and dark theme
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0a0a0a' },
          headerTintColor: '#e0e0e0',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0a0a0a' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            title: 'VoiceBridge',
            headerShown: false,
          }}
        />
      </Stack>
    </>
  );
}
