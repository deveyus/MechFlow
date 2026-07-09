# 001 — Skip chain.find() optimization

**Date:** 2026-07-09
**Status:** Accepted

## Context

During performance review, an external evaluation flagged `chain.find()` as O(n) — it does a linear scan of the links array. The suggestion was to add a `Map<subscriberId, index>` to enable O(1) lookups.

## Decision

We chose NOT to add the map. The chain is typically as long as the number of subscribers per event (usually <100). Scanning the entire chain is cheap, and adding a map would:
- Increase memory per chain (a Map per tick per event)
- Add complexity to `append()` (must update index)
- Complicate the error-prone temp-ID lifecycle in the proxy

## Consequences

- `chain.find()` remains O(n) — acceptable for real-world subscriber counts
- The chain object stays simple: a flat array with convenience accessors
- If profiling later shows `find()` as a bottleneck, the map can be added without breaking changes
