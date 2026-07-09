# 005 — Fail-continue semantics

**Date:** 2026-07-09
**Status:** Accepted

## Context

Most state libraries treat subscriber errors as fatal — one throws, the whole update aborts, and state rolls back. This is inappropriate for pipeline processing where each subscriber is an independent transformation.

## Decision

A failing subscriber never aborts the tick. All subscribers run regardless of prior errors. Failed subscribers produce a stutter-link in the chain (same state, error attached). Subsequent subscribers see the state as it was before the failed subscriber (via `chain.current` which skips error links).

## Consequences

- A broken subscriber can't take down the entire tick
- Error links appear in the chain for post-hoc inspection
- Subscribers after a failure see pre-failure state — must handle stale data if they depend on the failed subscriber's output
- Recovery subscribers can be placed after a known-failing subscriber to compensate
