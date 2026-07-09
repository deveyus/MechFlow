# 004 — Errors as values, never thrown

**Date:** 2026-07-09
**Status:** Accepted

## Context

Exceptions as control flow are invisible in the type system, easy to forget to handle, and expensive (stack unwinding). The Rust `Result<T, E>` pattern is a proven alternative.

## Decision

Subscriber errors use a local `Result<Delta, SubscriberError>` discriminated union:

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
```

`Ok(value)` and `Err(error)` are plain-object constructors — no classes, no prototype methods. System-integrity errors (cycles, duplicate subscriber IDs) still throw `Error` — those are programmer mistakes that should fail fast, not runtime conditions to be handled gracefully.

## Consequences

- Error paths are fully typed — callers must handle both branches
- No try/catch needed around subscriber execution
- Failing subscribers produce a typed error link in the chain — inspectable after the tick
- System-integrity errors remain as thrown exceptions (fail fast)
