import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { CaptainAuthProvider } from "./captain-auth-provider";
import "./global.css";

export default function App() {
  return (
    <CaptainAuthProvider>
      <View className="flex-1 items-center justify-center bg-white">
        <Text>Welcome to {name}</Text>
        <StatusBar style="auto" />
      </View>
    </CaptainAuthProvider>
  );
}
