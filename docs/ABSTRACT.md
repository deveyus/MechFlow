# Mechworld — Reactive Core Abstract

## Problem

A TTRPG character sheet is a dense graph of interdependent values. Strength modifies attack rolls. Attack rolls modify damage. Damage modifies HP. HP modifies bloodied. Bloodied modifies other rules. Existing reactive frameworks solve this with implicit dependency tracking (getter interception during execution), which obscures the data flow and makes ordering brittle and non-local.

We need an alternative where dependencies and resolution order are **explicit, locally declared, and centrally validated.**

## Core Model

### Event-Driven State Machine

State is represented as named fields (hp, status, etc.). The only way state changes is via an **event**. When an event fires:

1. A **chain** is initialized with the current state as its first entry.
2. Subscribers are called in the **resolved total order** derived from the declared partial-ordering constraints.
3. Each subscriber receives the chain, reads whatever state position it needs, and returns a **`Result<Delta, SubscriberError>`**.
4. If `Ok(delta)`, the delta is applied and a new link is appended to the chain with the updated state. If `Err(error)`, a new link is appended with the same state and the error attached.
5. The last state in the chain becomes the current state for the next tick.

Each event cycle is called a **tick**. Subscribers run sequentially, each seeing the accumulated work of all prior subscribers.

### Chain

Every subscriber receives `{ chain, tick }`. The chain is an ordered list of links, each representing one subscriber's result:

- **`chain.first`** — the initial state when the event fired (index 0, no subscriber).
- **`chain.current`** — the state of the last **successful** link (skips error links).
- **`chain.unsafeCurrent`** — the state of the last link regardless (errors won't have mutated state, so this equals the last success's state in practice, but the distinction is explicit).
- **`chain.at(-2)`** — the state before the immediately preceding subscriber.

Each link is `{ state: State, error?: SubscriberError }`. A link without an error means the subscriber returned a successful delta. A link with an error means the subscriber failed — its state is identical to the prior link's state.

Convenience accessors (`chain.first`, `chain.current`, `chain.unsafeCurrent`) are provided for readability — they are simple aliases over positional reads. The chain is append-only and observable, giving subscribers full visibility into the resolution sequence. Failed subscribers are visible in the chain as stutters — state unchanged, error attached.

### Error Handling

Subscriber errors are values using the `Result` pattern (Rust-style discriminated union), never thrown. System-integrity errors (cycles in ordering) throw — they represent programmer mistakes, not runtime conditions.

- A subscriber returns `Result<Delta, SubscriberError>`.
- If the result is `Ok(delta)`, the delta is applied and appended to the chain as a new state.
- If the result is `Err(error)`, no delta is applied. An **error link** is appended to the chain instead — same state as the prior entry, plus the error payload.

Each link in the chain is `{ state: State, error?: SubscriberError }`:

- `chain.current` returns the state of the last successful link (skips error links).
- `chain.unsafeCurrent` returns the state of the last link regardless (identical to `current` in the success case, distinct from it when the last subscriber failed).
- Subscribers that need to react to prior failures inspect `chain.at(-1).error` or iterate the chain.
- Tooling can render the chain with failed links visually distinguished.

Failures never abort a tick. All subscribers run regardless of prior errors. The tick result includes the final state and the complete chain (successes and failures alike). Downstream subscribers can make informed decisions based on what failed before them.

### Ordering, Not Merging

There is no per-field merge strategy. The ordering graph **is** the merge strategy:

- Each subscriber declares `before` / `after` constraints via chained `.after().before()` calls on its subscription builder.
- These partial ordering edges are collected centrally at boot.
- A topological sort (Kahn's algorithm, O(V+E)) resolves the partials into a total order.
- Deltas apply in that resolved sequence. For any given field, the later subscriber wins.

This is simple, deterministic, and composition-safe. Adding a new subscriber only changes ordering if you explicitly add edges to it.

## Architectural Boundaries

### Logic ↔ View Decoupling

The reactive core (fields, events, subscribers, ordering) is pure TypeScript. It imports nothing from the DOM, no component libraries, no template system. Models are composed of plain functions operating on reactive primitives.

Views are Web Components that import from the reactive core. The component declares which fields/events it depends on and how to render them. The core never knows about the component.

### Declarative View Binding (Runtime)

Templates use declarative binding attributes (e.g., `mf-text`, `mf-bind`, `mf-toggle`) in the HTML. A small runtime walks the shadow DOM in `connectedCallback` and wires these attributes to the reactive core. No build step is needed for templates — the HTML can be served as-is. This is the same operational model as HTMX: minimal runtime, declarative HTML, no compilation.

### Type-Driven API

Using TypeScript's type system (tRPC-style inference), field definitions carry their types through the subscription chain. Subscribers receive fully-typed context objects. Event payloads are typed. The wiring graph can be introspected by tooling without runtime code generation.

## Design Influences

- **Rapide** (Stanford, 1989–2000) — partial-order event semantics, explicit causality tracking, pattern-based reaction to event sets. The academic precursor that proved the model works; we modernize it for web developer ergonomics.
- **tRPC** — type inference across module boundaries without a central registry or code generation.
- **Web Components (Custom Elements v1)** — framework-agnostic component model, native shadow DOM encapsulation, no build step required.
- **HTMX** — declarative HTML attributes for behavior, minimal runtime, runtime resolution of bindings.

## Constraints (Explicitly Absent)

- No implicit dependency tracking (no getter interception, no "active subscriber" global)
- No per-field merge strategies — ordering is the only resolution mechanism
- No JSX — templates are HTML, runtime-resolved
- No central wiring file required — subscriptions and partial ordering edges live alongside the components that declare them, resolved centrally at boot
- No build step for templates — the reactive core is packaged as a library, not a compiler
- No exceptions — all errors are values (`Result<Delta, SubscriberError>`), never thrown
