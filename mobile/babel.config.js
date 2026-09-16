module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Must be listed last — react-native-reanimated v4 delegates its worklet
    // transform to the separate react-native-worklets package.
    plugins: ["react-native-worklets/plugin"],
  };
};
