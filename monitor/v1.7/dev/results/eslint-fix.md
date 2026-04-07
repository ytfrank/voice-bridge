# ESLint Fix Report

**Date:** 2026-04-07
**Branch:** dev_v1.6
**Status:** PASS (0 errors, 5 warnings)

## Problem

`npm run lint` failed with: `ESLint couldn't find a configuration file`

## Root Cause

- No ESLint config file existed (no `.eslintrc` or `eslint.config.js`)
- ESLint 8.57 was installed with `--ext` flag (deprecated in ESLint 9)
- Old `@typescript-eslint/eslint-plugin` v7 + `@typescript-eslint/parser` v7 were installed (incompatible with ESLint 9)

## Changes

### 1. Dependencies

| Package | Before | After |
|---|---|---|
| eslint | ^8.57.0 | ^9.39.4 |
| @eslint/js | (transitive) | ^9.39.4 |
| eslint-config-expo | - | ^9.2.0 |
| typescript-eslint | - | ^8.58.0 |
| @typescript-eslint/parser | v7 (removed) | ^8.58.0 |
| @typescript-eslint/eslint-plugin | ^7.0.0 | removed (merged into typescript-eslint) |

### 2. Files Created

- `eslint.config.js` — Flat config using `eslint-config-expo/flat`

### 3. Files Modified

- `package.json` — Updated lint script from `eslint . --ext .ts,.tsx` to `eslint .` (flat config auto-detects file types)

## Config Details

```js
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['node_modules/', '.expo/', 'dist/', 'backend/', 'tests/', 'scripts/', '*.config.js', 'archive/'],
  },
]);
```

## Verification

```
$ npm run lint
0 errors, 5 warnings
```

Warnings are non-blocking (unused vars, missing deps in hooks, array-type style).
