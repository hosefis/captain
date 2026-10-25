const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const configuration = getDefaultConfig(__dirname);

/** Configures Metro to compile the application's NativeWind stylesheet. */
module.exports = withNativeWind(configuration, { input: "./src/global.css" });
