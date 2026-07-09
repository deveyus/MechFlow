# 006 — Subscribe proxy with auto-registration

**Date:** 2026-07-09
**Status:** Accepted (with caveats)

## Context

The chaining API (`system.subscribe(event, handler).id('x').after('y')`) is the primary ergonomic surface. The challenge is: when should the subscriber be registered? Before chaining (you don't have an ID yet) or after (you might forget)?

## Decision

`system.subscribe()` returns a `SubscriptionBuilder` that auto-registers the subscriber with a temp ID immediately. Chaining calls (`.id()`, `.before()`, `.after()`, `.priority()`) trigger re-registration via a proxy. This means you can't forget to register — it happens automatically.

### Implementation details (discovered during debugging):

- `SubscriptionBuilder.build()` copies `before`/`after` arrays to prevent shared-reference bugs with `currentReg` comparison. Without this, `origBefore()` mutated the array that was already captured in `currentReg`, causing `sameOrdering` to always return true.
- Duplicate ID detection excludes self: when `.before()` triggers re-registration, the check must not flag the subscriber's own prior entry in `regList`.
- Temp ID lookup falls back to `reg.id` when the temp entry was already replaced by `.id()`. Without this, chaining `.id('x').after('y')` would silently drop the `after` constraint from the handler list.
- `resolveOrdering` is skipped when ordering metadata hasn't changed (same `before`/`after`/`priority`), deferred to `boot()` for a single pass.

## Consequences

- Registration is automatic — you can't forget
- The proxy adds complexity (~80 lines) and was the source of several bugs during debugging
- Alternative considered: require explicit `.register()` terminal method — rejected for DX reasons
- Alternative considered: config-object API — rejected (less ergonomic for the ordering DSL)
