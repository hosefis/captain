import Link from "next/link";

/** Displays project onboarding and links to the Convex example. */
export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: 16 }}>
      <h1>{name}</h1>
      <p>Your app is ready. Connect Convex to start building.</p>
      <Link href="/example">Open the Convex task example</Link>
    </main>
  );
}
