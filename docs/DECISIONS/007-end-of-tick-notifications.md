# 007 — End-of-tick notifications

**Date:** 2026-07-09
**Status:** Accepted

## Context

`onFieldChange` callbacks were originally fired inside the subscriber loop — immediately after each successful subscriber's delta was applied. This meant a watcher could call `system.fire()` from within the callback, triggering a recursive nested tick on the same stack.

## Decision

Move field change notifications to the end of the tick. Capture the pre-tick state before the subscriber loop, apply all deltas, then compare the final state to the initial state and fire notifications for each changed field. Notifications fire once per field per tick with the net change.

## Consequences

- Watchers cannot trigger recursive nested ticks mid-loop
- Notifications report net changes per field (not per-subscriber intermediate changes)
- Slightly simpler code — `notifyFieldChanges` function was removed entirely
- Semantics changed: if subscriber A sets HP=15 and subscriber B sets HP=20 (back to original), no notification fires for HP (no net change)
