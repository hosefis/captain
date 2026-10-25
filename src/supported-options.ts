export type SupportedOption<Value extends string> = {
  value: Value;
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

/** Extract schema-ready values while retaining each option's literal type. */
export function optionValues<
  const Options extends readonly SupportedOption<string>[],
>(options: Options): { [Index in keyof Options]: Options[Index] extends SupportedOption<infer Value> ? Value : never } {
  return options.map((option) => option.value) as {
    [Index in keyof Options]: Options[Index] extends SupportedOption<infer Value> ? Value : never;
  };
}

/** List mobile translation options supported by the selected Expo runtime. */
export function compatibleMobileI18n(runtime: "expo-go" | "dev-build") {
  return SUPPORTED_OPTIONS.mobileI18n.filter((option) =>
    runtime === "expo-go"
      ? option.value === "none"
      : option.value === "gt-react-native",
  );
}
