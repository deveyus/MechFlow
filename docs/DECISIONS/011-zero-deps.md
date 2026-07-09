# 011 — Zero runtime dependencies

**Date:** 2026-07-09
**Status:** Accepted

## Context

The library originally depended on `ts-results-es` for the `Result` type. Profiling during the performance optimization sprint showed `ErrImpl` (the class backing `ts-results-es`) consuming 73.5% of CPU samples and creating a double-wrap in `safeExecute` (handler returns `Result`, `safeExecute` re-wraps it).

## Decision

Removed `ts-results-es`. `Result<T, E>`, `Ok(value)`, and `Err(error)` are now local plain-object constructors:

```typescript
type OkResult<T> = { ok: true; value: T }
type ErrResult<E> = { ok: false; error: E }
type Result<T, E> = OkResult<T> | ErrResult<E>
```

No classes, no prototype methods, no inheritance. Just plain objects with a discriminated union tag.

## Consequences

- Zero runtime dependencies — `dist/mechflow.js` is a self-contained 17KB bundle
- ~79× reduction in profile samples (97,788 → 1,242)
- Dominant CPU cost shifted from `ErrImpl` (73.5%) to GC (33.7%)
- Result type must be maintained in-house — simple enough that it's unlikely to be a burden
