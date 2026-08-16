// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Force `tslib` to its CommonJS build.
 *
 * `pdf-lib` (used to fill government PDFs) depends on tslib, whose `exports` map sends the
 * `import` condition to `modules/index.js`. Metro resolves that and then cannot destructure it —
 * the app dies at startup with "Cannot destructure property '__extends' of 'tslib.default'",
 * before any screen renders. tslib's own `tslib.js` is the CommonJS build and works.
 *
 * Targeted at tslib specifically rather than switching off package-exports resolution wholesale,
 * which would change how every other dependency resolves.
 */
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return { type: 'sourceFile', filePath: require.resolve('tslib/tslib.js') };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
