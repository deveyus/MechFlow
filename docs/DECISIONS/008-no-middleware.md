# 008 — No middleware / plugin system

**Date:** 2026-07-09
**Status:** Accepted

## Context

Redux popularized middleware as a way to intercept and extend the dispatch pipeline. This is powerful but adds API surface and complexity before the use case is proven.

## Decision

Deliberately omitted. The chain provides raw audit data that middleware would operate on. Adding hooks (`beforeTick`, `afterSubscriber`, `afterTick`) would increase surface area and constrain future design. Can be added later as a `beforeTick`/`afterTick` callback on `createSystem` without breaking changes.

## Consequences

- No plugin ecosystem — logging, persistence, undo/redo must be written from scratch
- The chain object is the extension point — export it, persist it, inspect it
- Lower initial API surface
- Middleware can be added later as the use case demands
