# CAPTAIN — Product & Architecture Spec

**Status:** Locked (grilling complete)  
**Date:** 2026-07-04  
**Origin:** Architecture review of Zibee Front (`zibee-front`) — lessons extracted for a **new** generator repo, not changes to Zibee.  
**Next session goal:** Empty-folder bootstrap of the `create-captain` npm package — Phase 1 (CLI shell + bootstrap wrappers).

---

## 0. Project identity (codename)

### CAPTAIN

**Backronym:** **C**reate **A**pps **P**roperly — **T**emplates, **A**dapters, **I**ntegrations, **N**ow.

```
┌──────────────────────────────────────────────────────────┐
│  ★  C A P T A I N  ★                                     │
│                                                          │
│  "With great scaffolding comes great maintainability."   │
│   — probably Uncle Ben, if he shipped B2B2C SaaS         │
│                                                          │
│  In a world where devs clone eight identical CRUD        │
│  folders… ONE CLI asks questions FIRST.                  │
└──────────────────────────────────────────────────────────┘
```

| Field | Value |
|-------|--------|
| **Codename** | CAPTAIN |
| **npm package** | **`create-captain`** (locked — verified available on npm/pnpm registry, 2026-07-04) |
| **Binary** | `captain` and `create-captain` (both point to same entry; see `package.json` below) |
| **Repo folder** | `captain/` or `create-captain/` |
| **Scoped alt (optional)** | `@your-scope/create-captain` — only if you publish under an org later |

```json
{
  "name": "create-captain",
  "bin": {
    "captain": "./dist/cli.js",
    "create-captain": "./dist/cli.js"
  }
}
```

### npm registry availability (pnpm uses npmjs.com)

Checked 2026-07-04 via `npm view`:

| Name | Status | Conflict |
|------|--------|----------|
| **`create-captain`** | **Available** | — use this |
| `create-captain-cli` | Available | redundant |
| `captain-scaffold` | Available | weaker brand |
| `captain` | **Taken** (v0.2.4) | unrelated CLI — do not use as package name |
| `captain-cli` | **Taken** (v0.0.7) | dev teams utility |
| `@captain/cli` | **Taken** | scoped package exists |
| `create-captain-app` | **Taken** (v0.41.0) | Electron “Captain apps” scaffold — document that CAPTAIN is **not** this |

**Docs rule:** Always invoke via `pnpm dlx create-captain` / `npx create-captain`. Never `npm install -g captain` (wrong package).

**README one-liner:** CAPTAIN scaffolds Next.js, Expo, and Turborepo monorepos — not [create-captain-app](https://www.npmjs.com/package/create-captain-app) (Electron).

```bash
pnpm dlx create-captain@latest
pnpm dlx create-captain@latest --config ./project.json --yes   # agent mode
pnpm dlx create-captain add-module admin-catalog
pnpm dlx create-captain scaffold:catalog billing-types --fields name:string,description:string --archive
pnpm dlx create-captain migrate:to-monorepo --add mobile
```

---

## 1. Purpose

Build **CAPTAIN** — a dynamic project generator CLI runnable by humans or agents:

**Outcomes:**

- Scaffold **Next.js web**, **Expo mobile**, or **Turborepo monorepo** (optional desktop/Electron slot).
- Compose **auth**, **i18n**, **UI**, **backend**, **deep modules**, and **payment** from questionnaire answers.
- Generated code is **fully owned** by the project (copy-out, no runtime dependency on the CLI).
- Dependencies install at **latest** (unpinned); post-install **smoke validation** ensures nothing breaks.

---

## 2. Non-goals

- Do **not** refactor Zibee Front as part of this work.
- Do **not** pin dependency versions in recipes (CLI maintainer validates against latest before publishing CLI).
- Do **not** require cloning a template repo — everything ships **bundled in the npm package** (Option A).

---

## 3. Architectural vocabulary

Use consistently in code and docs:

| Term | Meaning |
|------|---------|
| **Module** | Deep domain unit (Authorization, PaymentCheckout, AdminCatalog, …) |
| **Interface** | Narrow public API of a module (`authorize()`, `initiateCheckout()`, …) |
| **Adapter** | Stack- or provider-specific implementation behind a seam |
| **Seam** | Boundary where adapters plug in (Next vs Expo vs Electron; Stripe vs FedaPay) |
| **Recipe** | Bundled template fragments + install steps for one adapter choice |
| **Copy-out** | Generated files live in the user's repo; they edit freely |

---

## 4. Three-phase init flow

### Phase 1 — Official bootstrap (`@latest`)

| Topology | Command |
|----------|---------|
| Web only | `pnpm dlx create-next-app@latest` |
| Mobile only | `pnpm dlx create-expo-app@latest` |
| Monorepo | `pnpm dlx create-turbo@latest` (+ add apps) |

### Phase 2 — CLI layers

- Install selected packages (unpinned).
- Emit deep modules, adapters, folder conventions, ESLint/i18n rules, `.env.example`, `CONTEXT.md` stub.
- Wire compatibility-selected combinations only.

### Phase 3 — Validation (Option D)

| Mode | Gate |
|------|------|
| Human interactive | `typecheck` + `lint` |
| Agent (`--config`) | `typecheck` + `lint` + **full build** |
| CLI publish CI | Full matrix smoke (web / expo / monorepo × top combos) |

On failure: non-zero exit, print which step broke + fix hint. Never leave a silently broken project.

---

## 5. Topology

| Mode | Output |
|------|--------|
| `web` | Next app + `packages/core` + `packages/adapters-next` |
| `mobile` | Expo app + `packages/core` + `packages/adapters-expo` |
| `monorepo` | Turborepo; `apps/web`, `apps/mobile`, optional `apps/desktop` |
| `migrate:to-monorepo` | Hoist packages, rewrite workspace refs, optional `--add mobile` |

**Rule:** Package names (`@acme/core`, `@acme/adapters-next`, …) are **identical** in standalone and monorepo so migration is filesystem + workspace config, not refactors.

**Desktop:** Reserve `apps/desktop` + `packages/adapters-desktop`. Electron typically wraps **static-exported web UI**; auth uses system browser + PKCE + `safeStorage`.

---

## 6. Stack matrix (locked user decisions)

### 6.1 Authentication

**Allowed:** `clerk` · `better-auth` · `workos`  
**Default:** `clerk`

| Provider | Next.js | Expo | Electron | Notes |
|----------|---------|------|----------|-------|
| Clerk | ✓ | ✓ (`@clerk/expo` + `expo-secure-store`) | ✓ | Default |
| Better Auth | ✓ | ✓ (Expo API Routes pattern) | soft warn | |
| WorkOS | ✓ | ✓ ([Expo AuthSession guide](https://workos.com/docs/integrations/react-native-expo)) | ✓ (PKCE) | Strong for desktop/B2B SSO |

**Route protection — follow framework, not custom nav layer:**

| Stack | Pattern |
|-------|---------|
| Next | `proxy.ts` / middleware + **DAL** re-auth in server actions ([Next Data Security](https://nextjs.org/docs/app/guides/data-security)) |
| Expo | `Stack.Protected` / `Tabs.Protected` (SDK 53+) |
| Electron | Main-process session gate + IPC; tokens never in renderer |

**Authorization module** (always when auth ≠ skip): single `authorize(action, claims) → Allow | Redirect | Deny` with stack adapters. Do not scatter permission logic across proxy, pages, server data, and CTAs (Zibee anti-pattern).

---

### 6.2 Internationalization

**Default:** General Translation (`gt-*`) unless user changes.

| Stack | Allowed | Default |
|-------|---------|---------|
| Next.js | `gt-next`, `next-intl` | `gt-next` |
| Expo | `gt-react-native`, `expo-localization` + `react-i18next` | `gt-react-native` |
| Electron | Inherit web stack | same as web |

**Always on Expo:** `expo-localization` (locale detection) regardless of translation library.

**GT Expo caveats:**

- Requires **dev build** — not Expo Go ([GT Expo quickstart](https://generaltranslation.com/en-US/docs/react-native/tutorials/quickstart-expo)).
- Hard **block** agent mode: `gt-react-native` + Expo Go.
- `gt-react-native` is experimental — soft warn for humans.

**i18n enforcement module** (when i18n selected): ESLint ban on hardcoded toast strings + parity check script (pattern from Zibee `pnpm i18n:check`).

---

### 6.3 UI

| Stack | Default | Alternatives |
|-------|---------|--------------|
| Next.js | **shadcn + Base UI** (`npx shadcn@latest create`, style `base-vega`) | shadcn + Radix · tailwind-only |
| Expo | **NativeWind** | React Native Paper · none |

Refs: [shadcn Base UI docs](https://ui.shadcn.com/docs/changelog/2026-01-base-ui)

---

### 6.4 Backend / data client

**Default:** self-hosted REST (`BackendClient` / HttpClient adapter).

| Backend | Next | Expo | Electron | CLI tier |
|---------|------|------|----------|----------|
| **rest** | HttpClient + server actions | fetch + auth token adapter | main-process IPC | **Default** |
| **convex** | `convex/react` + `convex/` folder | [Expo + Convex guide](https://docs.expo.dev/guides/using-convex) | same JS client | **Strong option** |
| **supabase** | `@supabase/supabase-js` | [Expo guide](https://docs.expo.dev/guides/using-supabase) | ✓ | Supported |
| **firebase** | Firebase JS SDK | [Expo database guide](https://docs.expo.dev/develop/database/) | ✓ | Supported |

When `backend: convex`, skip REST HttpClient default; emit Convex provider + `convex/` scaffold. Pair with `@convex-dev/polar` when payments = polar.

---

## 7. Deep modules — init defaults

| Module | Default on init | Notes |
|--------|-----------------|-------|
| **BackendClient** | Yes | Adapter swaps with backend choice |
| **Authorization** | Yes (if auth selected) | One interface, N call sites |
| **i18n enforcement** | Yes (if i18n selected) | ESLint + check script |
| **PaymentCheckout** | **No** | Opt-in when any payment processor selected |
| **AdminCatalog** | No | Powers generic `scaffold:catalog` |
| **FormWizard** | No | Multi-step + upload flows |
| **User Identity** | No | Single users module; role as parameter (no providers/customers split) |

When **payment is selected**, always emit **PaymentCheckout + webhook stub + `.env.example` + i18n namespace** — never inline payment logic in feature forms (Zibee anti-pattern).

---

## 8. PaymentCheckout module

> **Deferred from the Tier A release.** Payment is not part of the current
> executable configuration or recipe surface. Its preserved design and future
> release criteria live in
> [`docs/specs/payment-release.md`](docs/specs/payment-release.md).

### 8.1 Interface

```ts
type CheckoutContext = {
  productId?: string;
  amount?: number;
  currency: string;
  customer: { email: string; userId: string };
  returnPath: string;
  pendingPath?: string;
  metadata?: Record<string, unknown>;
};

type CheckoutResult =
  | { kind: "redirect"; url: string }
  | { kind: "pending"; paymentRef: string; pollPath?: string }
  | { kind: "success"; receiptId: string }
  | { kind: "hosted"; openInBrowser: true };

function initiateCheckout(ctx: CheckoutContext): Promise<CheckoutResult>;
```

### 8.2 Orchestration modes

| Mode | When |
|------|------|
| **provider-direct** | Stripe, Polar, Paddle, Lemon Squeezy |
| **backend-mediated** | Custom REST API (Zibee today) |
| **aggregator-hosted** | FedaPay, PayDunya, CinetPay, Paystack, Flutterwave (often redirect + IPN) |

### 8.3 Global processors

| Processor | Next.js | Expo | Electron | Default pairing |
|-----------|---------|------|----------|-----------------|
| **stripe** | Clerk Billing or direct Stripe | `@stripe/stripe-react-native` ([Expo doc](https://docs.expo.dev/versions/latest/sdk/stripe/)) | hosted / web inherit | **`auth: clerk` → Clerk Billing** ([Clerk Billing](https://clerk.com/docs/guides/billing/overview)) |
| **lemon-squeezy** | `@lemonsqueezy/lemonsqueezy.js` server + webhooks | hosted URL + WebBrowser | hosted | MoR SaaS |
| **polar** | `@polar-sh/nextjs` | hosted URL | hosted | **`backend: convex` → `@convex-dev/polar`** |
| **paddle** | `@paddle/paddle-js` + webhooks | hosted | hosted | MoR SaaS |

**CLI rule:** `auth: clerk` + `payments: stripe` → emit **Clerk Billing** recipe, not duplicate raw Stripe unless user opts `stripe-direct`.

### 8.4 African / mobile money processors

| Processor | Region | v1 priority | Notes |
|-----------|--------|-------------|-------|
| **fedapay** | West Africa (XOF, MTN/Moov…) | **Ship first** | [Node SDK](https://docs.fedapay.com/sdks/en/nodejs-en); redirect or `sendNowWithToken` (Zibee Intouch pattern) |
| **paystack** | NG, GH, SA | **Ship first** | Expo: `react-native-paystack-webview`; always server verify |
| **flutterwave** | Pan-Africa | Supported | WebView + server verify |
| **paydunya** | Francophone | Supported | [Hosted + IPN](https://developers.paydunya.com/doc/EN/introduction) |
| **cinetpay** | UEMOA + CM | Supported | Hosted page + webhook |
| **custom-api** | Any | **Ship first** | Zibee mode: API returns `checkout_url` OR `payment_initialized` + `payment_ref` → pending poll |

**v1 African trio:** `fedapay` + `paystack` + `custom-api`.

Emit **PendingPayment screen + poll hook** when adapter can return `pending`.

### 8.5 Payment compatibility rules

| Combo | Action |
|-------|--------|
| `auth: clerk` + `payments: stripe` | Allow — default Clerk Billing |
| `backend: convex` + `payments: polar` | Allow — recommend `@convex-dev/polar` |
| `backend: rest` + `payments: custom-api` | Allow — Zibee adapter |
| `payments: fedapay` + provider-direct without server routes | Block (agent) / warn (human) |
| `expo` + global MoR expecting native PaymentSheet for Paddle/LS | Soft warn — use hosted browser |
| Multiple global MoR selected | Soft warn — one MoR per product |

---

## 9. AdminCatalog & generators (generic CRUD)

Not Zibee-specific. One deep **AdminCatalog** module driven by `ResourceConfig`:

```ts
type AdminCatalogConfig = {
  apiPath: string;
  tag: string;
  schema: { create: ZodSchema; edit: ZodSchema };
  columns: ColumnDef[];
  i18nNamespace: string;
  flags?: { archive?: boolean; delete?: boolean };
};
```

```bash
pnpm dlx create-captain scaffold:catalog billing-types \
  --fields name:string,description:string \
  --archive
```

Emits: config file, admin routes, i18n stubs (`en` + `fr`), server data/action wiring. No per-resource `*-form-wrapper.tsx` proliferation (Zibee anti-pattern).

Other Zibee-derived modules (opt-in): **FormWizard**, unified **User Identity** (role as parameter, not separate `providers/` / `customers/` folders).

---

## 10. Compatibility engine (Option C)

```json
{
  "agentMode": { "softWarn": "upgrade-to-block" },
  "humanMode": { "softWarn": "confirm-prompt" },
  "hardBlocks": [
    { "stack": "expo", "i18n": "next-intl" },
    { "stack": "expo", "i18n": "gt-next" },
    { "stack": "next", "i18n": "gt-react-native" },
    { "stack": "expo", "i18n": "gt-react-native", "runtime": "expo-go" },
    { "stack": "expo", "auth": "authjs" }
  ]
}
```

Maintain full matrix in `compatibility.json` (bundled at package root). Agent pre-flight: fetch latest docs for selected packages before scaffold.

---

## 11. Human questionnaire order

```
1.  projectName
2.  packageManager          (pnpm | npm | bun)     — default pnpm
3.  topology                (web | mobile | monorepo)
4.  apps[]                  (if monorepo: web, mobile, desktop)
5.  backend                 (rest | convex | supabase | firebase)
6.  auth                    (clerk | better-auth | workos | skip)
7.  i18n                    (stack-filtered; default gt variant)
8.  ui                      (stack-filtered; defaults above)
9.  modules[]               (admin-catalog | form-wizard | user-identity | payment)
10. payment                 (if payment in modules: processors + orchestration + primary)
11. locales[]               (e.g. en, fr)
12. defaultLocale
→ resolve → Phase 1 bootstrap → Phase 2 scaffold → Phase 3 validate
```

---

## 12. Agent config schema (draft)

File: `project.json` passed to `--config`.

```json
{
  "$schema": "https://your-scope.dev/captain.schema.json",
  "name": "acme-platform",
  "packageManager": "pnpm",
  "topology": "monorepo",
  "apps": ["web", "mobile"],
  "backend": "rest",
  "auth": "clerk",
  "i18n": {
    "web": "gt-next",
    "mobile": "gt-react-native"
  },
  "ui": {
    "web": "shadcn-base-ui",
    "mobile": "nativewind"
  },
  "modules": ["authorization", "admin-catalog"],
  "payment": {
    "enabled": false,
    "processors": [],
    "orchestration": "backend-mediated",
    "primary": null
  },
  "locales": ["en", "fr"],
  "defaultLocale": "fr",
  "validation": "strict"
}
```

Implement schema with **Zod v4**. Export JSON Schema for tooling.

**Agent workflow:**

1. Read `--config project.json`
2. Fetch current docs for each selected package (Context7 MCP or official URLs)
3. Run `pnpm dlx create-captain@latest --config project.json --yes`
4. Exit non-zero on compatibility block or smoke failure

---

## 13. Proposed CLI package layout

Full target (grow into this). **v0.1 minimal tree → see §19.**

```
create-captain/
  SPEC.md
  package.json
  tsup.config.ts
  tsconfig.json
  compatibility.json
  src/
    cli.ts
    commands/          init | add-module | scaffold-catalog | migrate-to-monorepo
    schema/
    resolver/
    validators/
  recipes/             # bundled adapter + module recipes (grow over time)
    bootstrap/
    adapters/
    modules/
  templates/
  vitest.config.ts
```

**Monorepo target layout** (generated):

```
my-product/
  turbo.json
  pnpm-workspace.yaml
  apps/web/ | apps/mobile/ | apps/desktop/
  packages/core/
  packages/adapters-next/ | adapters-expo/ | adapters-desktop/
  tools/scaffold/                   # optional local generators
```

---

## 14. Implementation build order

1. CLI shell — prompts, Zod schema, compatibility resolver, smoke runner  
2. Bootstrap recipes — wrap official `create-*@latest`  
3. **BackendClient + Authorization** — all stacks  
4. **i18n adapters** — gt-next, gt-react-native, next-intl, react-i18next  
5. **PaymentCheckout** — clerk-billing → custom-api → fedapay → paystack  
6. **AdminCatalog + `scaffold:catalog`**  
7. FormWizard · User Identity  
8. `migrate:to-monorepo`  
9. CLI publish CI matrix  

---

## 15. Zibee lessons encoded (reference only)

Source repo: `zibee-front` (Next.js 16, Clerk, next-intl, external REST API). Do not modify.

| Lesson | Scaffold encoding |
|--------|-------------------|
| Permission scatter | Authorization module |
| 8× admin CRUD clones | AdminCatalog + `scaffold:catalog` |
| providers/customers split | User Identity module, role param |
| Payment in certification forms | PaymentCheckout module |
| Multi-step draft duplication | FormWizard module |
| No tests on HttpClient | BackendClient + vitest + InMemory adapter day one |
| Hardcoded toasts | i18n enforcement ESLint rule |

Architecture review HTML (exploration artifact): `%TEMP%/architecture-review-20260704-051152.html` on the machine where review was run — optional reference, not required for CLI work.

---

## 16. Open items (post-v1)

- [x] Project codename: **CAPTAIN**
- [x] npm package name: **`create-captain`** (registry available; verified 2026-07-04)
- [ ] Choose npm scope (optional: `@your-scope/create-captain` instead of unscoped)
- [ ] `CONTEXT.md` generator template content
- [ ] Electron adapter depth (v1 = slot + inherit web vs full Nextron-style)
- [ ] `@use-africa-pay/react-native` as optional unified Expo adapter
- [ ] Monthly CLI release process + doc freshness checklist for agents
- [ ] Publish JSON Schema URL

---

## 17. Suggested skills (next agent)

Invoke these when implementing:

| Skill | Use when |
|-------|----------|
| [`handoff`](file://~/.agents/skills/handoff/SKILL.md) | Further session handoffs |
| [`grill-me`](file://~/.agents/skills/grill-me/SKILL.md) | Stress-test CLI design decisions before coding |
| [`context7-mcp`](file://~/.cursor/plugins/cache/cursor-public/context7-plugin/.../context7-mcp/SKILL.md) | Fetch latest docs for Clerk, Convex, Polar, GT, Expo, Next.js during recipe authoring |
| [`create-skill`](file://~/.cursor/skills-cursor/create-skill/SKILL.md) | Add a CAPTAIN maintainer skill after v0.1 |
| [`sdk`](file://~/.cursor/skills-cursor/sdk/SKILL.md) | npm package structure, `bin` entry, `dlx` publishing |
| Clerk **`clerk-setup`** / **`clerk-billing`** | Clerk Billing + Next.js recipes |
| Convex **`convex-quickstart`** / **`components-guide`** | Convex backend + `@convex-dev/polar` |
| Convex **`function-creator`** | Convex action wrappers for payment webhooks |

---

## 18. Key documentation URLs

| Topic | URL |
|-------|-----|
| Next.js auth | https://nextjs.org/docs/app/guides/authentication |
| Next.js i18n | https://nextjs.org/docs/app/guides/internationalization |
| Next.js DAL | https://nextjs.org/docs/app/guides/data-security |
| Expo auth | https://docs.expo.dev/develop/authentication/ |
| Expo localization | https://docs.expo.dev/guides/localization/ |
| Expo + Convex | https://docs.expo.dev/guides/using-convex |
| Expo + Stripe | https://docs.expo.dev/versions/latest/sdk/stripe/ |
| WorkOS + Expo | https://workos.com/docs/integrations/react-native-expo |
| GT Expo | https://generaltranslation.com/en-US/docs/react-native/tutorials/quickstart-expo |
| Clerk Billing | https://clerk.com/docs/guides/billing/overview |
| Polar Next.js | https://polar.sh/docs/guides/nextjs |
| Convex Polar | https://github.com/get-convex/polar |
| Lemon Squeezy Next.js | https://docs.lemonsqueezy.com/guides/tutorials/nextjs-saas-billing |
| Paddle Next.js starter | https://developer.paddle.com/get-started/starter-kits/nextjs-saas |
| FedaPay Node SDK | https://docs.fedapay.com/sdks/en/nodejs-en |
| shadcn Base UI | https://ui.shadcn.com/docs/changelog/2026-01-base-ui |

---

## 19. Generator repo stack (CAPTAIN itself)

Stack for building **this CLI** — not what CAPTAIN generates.

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Node **22+** | Matches Zibee; works with `pnpm dlx`, `npx`, `bunx` |
| **Language** | TypeScript **strict** | Typed recipes; Zod v4 inference |
| **Package manager** | **pnpm** | User default; Corepack in CI |
| **Distribution** | Single npm package **`create-captain`** | Bundled recipes; one `dlx` entry |
| **Build** | **tsup** | ESM bundle → `dist/cli.js`; fast CI |
| **CLI routing** | **citty** or **commander** | `init`, `add-module`, `scaffold:catalog`, `migrate:to-monorepo` |
| **Prompts** | **@clack/prompts** | Human wizard; skipped with `--config` + `--yes` |
| **Config / schema** | **Zod v4** + exported JSON Schema | Agent `project.json`; compatibility engine |
| **Child processes** | **execa** | Wrap `create-next-app@latest`, installs, smoke scripts |
| **File generation** | **`templates/` + copy** + `{placeholder}` replace | No Handlebars until loops/partials needed |
| **Tests** | **Vitest** | Unit: resolver + compat; integration: temp dir + mocked bootstrap |
| **CI** | GitHub Actions | Matrix: generate fixtures → lint / typecheck / build |

### v0.1 repo layout (single package — start here)

```
captain/                         # empty folder → init this structure
  SPEC.md                        # this file
  package.json
  tsup.config.ts
  tsconfig.json
  .nvmrc                         # 22.13.0 or latest LTS you standardize on
  src/
    cli.ts                       # entry: citty/commander subcommands
    commands/
    schema/project-config.ts     # Zod v4
    resolver/compatibility.ts
    validators/smoke.ts
  templates/
  compatibility.json
  vitest.config.ts
  .github/workflows/ci.yml       # add when first recipe lands
```

**Do not** start with Turborepo inside the generator repo. Split into `packages/create-captain` + `packages/recipes` only when the bundle outgrows ~500KB or release cadence diverges.

### Deliberate non-choices (v0.1)

| Skip | Reason |
|------|--------|
| Bun-only runtime | `npx` / `pnpm dlx` expect Node |
| Rust / Go CLI | Slower recipe iteration |
| Handlebars / Plop | Folders + replace is enough initially |
| ts-morph | Save for `migrate:to-monorepo` AST edits later |
| Remote templates (giget) | Bundled recipes (Option A) |

### Agent-friendly CLI flags (ship with v0.1 shell)

| Flag | Purpose |
|------|---------|
| `--config project.json` | Agent input (no prompts) |
| `--yes` | Accept defaults / skip confirm |
| `--dry-run` | Print plan only |
| `--json` | Machine-readable result |
| `--verify-docs` | Optional npm-latest vs recipe drift report |

### Empty-folder bootstrap (first session checklist)

1. `mkdir captain && cd captain`
2. Copy this file → `SPEC.md`
3. `pnpm init`; set `"type": "module"`, `"bin": { "captain": "./dist/cli.js" }`
4. Add deps: `typescript`, `tsup`, `zod`, `citty` (or `commander`), `@clack/prompts`, `execa`, `vitest`
5. `tsup.config.ts` → bundle `src/cli.ts` → `dist/cli.js`
6. Implement `captain init --dry-run` that parses `project.json` and runs compatibility resolver only
7. Wire real `create-next-app@latest` spawn in `init` once resolver passes
8. Add CI matrix when smoke runner exists

### Optional dogfooding (post-v1)

Use Turborepo **inside the generator repo** when adding `packages/test-fixtures` (golden generated projects). Mirrors what CAPTAIN emits for users without blocking v0.1.

---

*End of spec. Copy this file to the root of your empty folder as `SPEC.md` and begin §19 empty-folder bootstrap.*
