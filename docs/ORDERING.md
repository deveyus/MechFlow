# MechFlow Ordering Reference

## Concept

MechFlow resolves subscriber execution order through a **partial ordering** system. Each subscriber declares which other subscribers it must run before or after. These partial constraints are collected at boot and resolved into a total order via topological sort.

This replaces both implicit dependency tracking (solidjs/vue) and per-field merge strategies with a single explicit mechanism.

## Declaring Ordering

Ordering constraints are chained after the subscription:

```ts
subscribe(event, handler)
  .id('apply-damage')
  .before('heal')              // must run before 'heal'

subscribe(event, handler)
  .id('heal')
  .after('apply-damage')       // must run after 'apply-damage'
```

An `id` is required when any ordering edge references the subscriber. Both before and after accept multiple arguments:

```ts
subscribe(event, handler)
  .id('rage-damage')
  .before('enrage', 'renew')
  .after('damage-calc')
```

## Priority Hints

For subscribers with constraints but no strict need for a specific position, a priority hint expresses "as early as possible" or "as late as possible" within the constraint window:

```ts
subscribe(event, handler)
  .id('log-damage')
  .after('damage-calc')
  .priority('early')   // schedule as early as possible after damage-calc
```

`'early'` places the subscriber as soon in the resolved order as its constraints allow. `'late'` places it as late as possible. Subscribers with no priority hint receive a stable but unspecified placement within their constraint layer.

Priority is a soft hint — it never overrides a hard `before`/`after` edge. If two subscribers conflict on priority within the same layer, the result is stable but not guaranteed across system versions.

## Resolution Algorithm

At boot, the system collects all subscribers and all declared edges:

### Graph Construction

```
For each subscriber S:
    add vertex S
    for each id in S.before:
        add edge S → id
    for each id in S.after:
        add edge id → S
```

### Cycle Detection

The system runs Kahn's algorithm. If the queue empties before all vertices are processed, the remaining vertices form a cycle:

```
Cycle detected: [enrage → renew → enrage]
System startup aborted with cycle report
```

Cycles are reported with the full loop path for debugging.

### Topological Sort

If no cycle, Kahn's algorithm produces a total order:

```
resolvedOrder = ['damage-calc', 'apply-damage', 'rage-damage', 'heal', 'enrage', 'renew']
```

## Ordering Rules

| Situation | Resolution |
|-----------|------------|
| A declared before B | A always runs before B |
| A declared after B | A always runs after B |
| No edge between A and B | Order is **stable but unspecified** — deterministic but not guaranteed across system versions |
| Conflicting edges (A before B and B before A) | Cycle — system refuses to start |
| Reference to nonexistent ID | Warning emitted, edge ignored |

## Algorithm Stability

Kahn's algorithm produces deterministic output when the underlying data structures have deterministic iteration order. The implementation uses `Map<K, V[]>` for the adjacency list and `Set` for tracking — both guarantee insertion-order iteration per the ECMAScript spec. This ensures stable output across all spec-compliant engines (V8, SpiderMonkey, JavaScriptCore).

## Determinism Guarantee

The resolved order is a **total order** — for any two subscribers A and B, A either runs before B, B runs before A, or there is a cycle and the system does not start.

For subscribers with no mutual edges (disconnected subgraphs), the order is deterministic within a single system build but is not semantically meaningful and may change with subscriber set additions.

## Visualizing the DAG

The system provides a `system.graph()` method that returns the adjacency map for inspection and debugging. `after` targets are prefixed with `←`:

```ts
const graph = system.graph()
// Map(5) {
//   'damage-calc'  => ['apply-damage'],
//   'apply-damage' => ['←damage-calc', 'heal'],
//   'rage-damage'  => ['enrage', 'renew'],
//   'enrage'       => [],
//   'renew'        => [],
// }
```

Tooling can render this as a directed graph. Failed cycles include the offending path for debugging.
