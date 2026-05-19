const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// For web builds Expo SDK 54 sets hermes-stable transform profile by default,
// which does not support import.meta. Remove the profile key entirely so Metro
// falls back to its default ESM transform (supports import.meta) unless an
// explicit override is provided via env.
const explicitProfile = process.env.EXPO_PUBLIC_UNSTABLE_TRANSFORM_PROFILE;
if (explicitProfile) {
  config.transformer = { ...config.transformer, unstable_transformProfile: explicitProfile };
} else {
  // Destructure to drop the key rather than setting it to undefined,
  // which ensures Metro treats it as absent.
  // eslint-disable-next-line no-unused-vars
  const { unstable_transformProfile: _dropped, ...restTransformer } = config.transformer || {};
  config.transformer = restTransformer;
}

module.exports = config;
