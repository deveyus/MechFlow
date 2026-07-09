# 002 — No implicit dependency tracking

**Date:** 2026-07-09
**Status:** Accepted

## Context

Modern state libraries rely heavily on implicit dependency tracking: MobX proxies, Vue reactivity, SolidJS signals. These automatically track which reactive values a computation reads and re-run when they change. This is convenient but introduces magic — the "when does this re-run?" question becomes non-trivial.

## Decision

No signals, no proxies, no getter interception. State changes are explicit: subscribers declare ordering via `before()`/`after()`, the system resolves a topological order, and executes subscribers sequentially. A subscriber reads state through `ctx.chain.current` — it always gets the latest state after prior subscribers have run.

## Consequences

- Data flow is fully explicit and deterministic
- No glitches, no stale closures, no diamond problem
- More verbose than implicit tracking — every subscriber must declare its ordering constraints
- Easier to debug and reason about
