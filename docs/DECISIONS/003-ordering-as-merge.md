# 003 — Ordering graph IS the merge strategy

**Date:** 2026-07-09
**Status:** Accepted

## Context

Some state libraries use per-field merge policies (last-write-wins, custom reducer, CRDT merge). This adds configuration surface and makes the update model harder to predict.

## Decision

No per-field merge policies. The subscriber ordering graph determines write order — later writers win on conflicting fields. If subscriber A writes `{ hp: 15 }` and subscriber B writes `{ hp: 10 }`, the final value depends on which ran last according to the ordering constraints.

## Consequences

- Merge strategy is implicit in the ordering graph — no extra configuration
- Write conflicts are resolved deterministically by subscriber order
- Forces users to think about ordering when conflicts are possible
- Not suitable for collaborative/offline-first scenarios (no CRDT story)
