export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/** Shared domain surface — deep modules attach here in later CAPTAIN phases. */
export const CAPTAIN_CORE_VERSION = "0.0.0";
