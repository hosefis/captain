Here’s a concise restart checklist for **CAPTAIN** (`create-captain`).

---

## 1. Set up the repo folder

```powershell
mkdir C:\Codes\captain
cd C:\Codes\captain
Copy-Item "$env:TEMP\SPEC.md" -Destination ".\SPEC.md"
```

Your full spec lives at `%TEMP%\SPEC.md` (or the longer `create-app-SPEC-*.md` path). **`SPEC.md` in the repo is the source of truth** for the next agent/session.

---

## 2. What you’re building (one line)

**CAPTAIN** — npm package **`create-captain`**, binary `captain` / `create-captain`, eventually invoked as:

```bash
npm create captain@latest
pnpm dlx create-captain@latest
```

---

## 3. Generator stack (the CLI itself)

Node 22+ · TypeScript strict · **pnpm** · **tsup** · **citty** or **commander** · **@clack/prompts** · **Zod v4** · **execa** · **Vitest**

Single package at first — **no Turborepo** in the generator repo until later.

---

## 4. First-session bootstrap (from SPEC §19)

| Step | Action |
|------|--------|
| 1 | `pnpm init` — `"type": "module"`, `"name": "create-captain"` |
| 2 | Set `bin`: `captain` and `create-captain` → `./dist/cli.js` |
| 3 | Install dev deps: `typescript`, `tsup`, `vitest` |
| 4 | Install runtime deps: `zod`, `citty` (or `commander`), `@clack/prompts`, `execa` |
| 5 | Add `tsconfig.json`, `.nvmrc` (22+), `tsup.config.ts` |
| 6 | Create `src/cli.ts` with shebang → `#!/usr/bin/env node` in built output |
| 7 | **`--dry-run` first:** parse `project.json`, run compatibility resolver only |
| 8 | Then wire **`create-next-app@latest`** spawn in `init` |
| 9 | CI when smoke runner exists |

**v0.1 folder skeleton:**

```
captain/
  SPEC.md
  package.json
  tsup.config.ts
  tsconfig.json
  src/cli.ts, commands/, schema/, resolver/, validators/
  templates/
  compatibility.json
  vitest.config.ts
```

---

## 5. Implementation order (SPEC §14)

1. CLI shell (prompts, Zod schema, compatibility, smoke runner)  
2. Bootstrap wrappers (`create-next-app` / `create-expo-app` / `create-turbo`)  
3. BackendClient + Authorization  
4. i18n adapters  
5. PaymentCheckout  
6. AdminCatalog + `scaffold:catalog`  
7. FormWizard · User Identity  
8. `migrate:to-monorepo`  
9. Publish + CI matrix  

**v0.1 goal:** steps **1–2** only — a CLI that can init a Next app with `--dry-run` then real bootstrap.

---

## 6. How to work on it

- **New empty folder** → copy `SPEC.md` → open in Cursor → Agent mode: *“Read SPEC.md and implement §19 empty-folder bootstrap step 3–7.”*
- **Human test locally:** `pnpm build` → `node dist/cli.js` or `pnpm link` → `create-captain`
- **After first publish:** `npm create captain@latest`

---

## 7. Don’t mix up with Zibee

- **Zibee** (`zibee-front`) = reference only; don’t change it for CAPTAIN.  
- **CAPTAIN** = new repo that *generates* future projects using lessons from Zibee.

---

## 8. Tagline (locked)

*"With great scaffolding comes great maintainability."* — probably Uncle Ben, if he shipped B2B2C SaaS.

---

**Shortest path today:** `mkdir captain` → copy `SPEC.md` → Agent mode → *“Bootstrap create-captain per SPEC §19.”*