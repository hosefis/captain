export type SupportedOption<T extends string> = {
  value: T;
  label: string;
};

export const SUPPORTED_OPTIONS = {
  packageManagers: [
    { value: "pnpm", label: "pnpm (recommended)" },
    { value: "npm", label: "npm" },
    { value: "bun", label: "bun" },
  ],
  topologies: [
    { value: "web", label: "Web (Next.js)" },
    { value: "mobile", label: "Mobile (Expo)" },
    { value: "monorepo", label: "Monorepo (Next.js + Expo)" },
  ],
  runtimes: [
    { value: "dev-build", label: "Expo development build" },
    { value: "expo-go", label: "Expo Go" },
  ],
  backends: [
    { value: "rest", label: "REST API" },
    { value: "convex", label: "Convex" },
  ],
  authentication: [
    { value: "clerk", label: "Clerk" },
    { value: "none", label: "No authentication" },
  ],
  webI18n: [{ value: "gt-next", label: "General Translation" }],
  mobileI18n: [
    { value: "gt-react-native", label: "General Translation" },
    { value: "none", label: "No internationalization" },
  ],
  webUi: [{ value: "shadcn-base-ui", label: "shadcn + Base UI" }],
  mobileUi: [{ value: "nativewind", label: "NativeWind" }],
} as const;

export function optionValues<
  const T extends readonly SupportedOption<string>[],
>(options: T): { [K in keyof T]: T[K] extends SupportedOption<infer V> ? V : never } {
  return options.map((option) => option.value) as {
    [K in keyof T]: T[K] extends SupportedOption<infer V> ? V : never;
  };
}

export function compatibleMobileI18n(runtime: "expo-go" | "dev-build") {
  return SUPPORTED_OPTIONS.mobileI18n.filter((option) =>
    runtime === "expo-go"
      ? option.value === "none"
      : option.value === "gt-react-native",
  );
}
