# 009 — Singleton pattern accepted

**Date:** 2026-07-09
**Status:** Accepted

## Context

The standalone `subscribe()` function (exported from `mod.ts`) delegates to `getSystem()`, which returns a globally-set singleton. This is convenient for quick scripting but makes testing harder (state leaks between tests) and prevents multiple independent systems in the same page.

## Decision

Accepted as a pragmatic choice for the target use case (single-system pages, embedded widgets). The `system.subscribe()` method always works without the singleton for type safety and multi-system scenarios.

## Consequences

- `useSystem()` / `getSystem()` enables cross-module access without passing the system around
- Testing requires explicit `useSystem()` reset between tests
- Multiple systems in one page require using `system.subscribe()` instead of the standalone `subscribe()`
- Can be deprecated later in favor of explicit DI without breaking the method form
