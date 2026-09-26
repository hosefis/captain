import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function HomePage() {
  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold" }}>{name}</Text>
      <Text>Your app is ready. Connect Convex to start building.</Text>
      <Link href="/example">Open the Convex task example</Link>
    </View>
  );
}
