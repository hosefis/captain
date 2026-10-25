const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

/** Configures Metro to compile the application's NativeWind stylesheet. */
module.exports = withNativeWind(config, { input: "./src/global.css" });
