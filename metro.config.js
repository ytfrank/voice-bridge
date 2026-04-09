const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Fix: use default transformer profile for web to avoid import.meta errors
// Hermes-stable profile doesn't fully support import.meta
config.transformer = {
  ...config.transformer,
  unstable_transformProfile: process.env.EXPO_PUBLIC_UNSTABLE_TRANSFORM_PROFILE || undefined,
};

module.exports = config;
