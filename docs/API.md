# MechFlow API Reference

## Fields

### `field(name: string, options: FieldOptions<T>): Field<T, N>`

Define a named field with a default value. `T` is inferred from the default, so no explicit type annotation is needed.

```ts
const hp = field('hp', { default: 20 })
const status = field('status', { default: 'healthy' as string })
```

The returned `Field<T, N>` carries its type (`T`) and literal field name (`N`) through the system. Fields are the atomic units of state — subscribers produce deltas that target specific fields.

## Events

### `event<E = void>(name: string): Event<E>`

Define a named event with a typed payload. The type parameter defaults to `void` for events that carry no data.

```ts
interface DamageEvent { amount: number; source: string }
const damageTaken = event<DamageEvent>('damage:taken')

// Events without a payload (E defaults to void)
const turnStart = event('turn:start')
```

Events carry their payload type through the subscriber context. Using an explicit interface is the standard convention — it makes the contract visible at the definition site.

## System

### `createSystem(config: SystemConfig): System<S>`

Create a MechFlow system instance. `S` is inferred from the field list.

```ts
const system = createSystem({
  fields: [hp, status, rage],
  events: [damageTaken, turnStart, healApplied],
})
```

### `System<S>`

```
System<S> {
  readonly state: S
  field(name: string): Field | undefined
  event(name: string): Event | undefined
  readField(name: string): unknown
  subscribe<E>(event, handler): SubscriptionBuilder<S>
  fire<E>(event, payload): TickResult<S>
  graph(): Map<string, string[]>
  onFieldChange(name, cb): () => void
  tick: number
}
```

| Member | Description |
|--------|-------------|
| `state` | Current system state (shallow copy, read-only) |
| `field(name)` | Look up a field by name |
| `event(name)` | Look up an event by name |
| `readField(name)` | Read a field's current value |
| `subscribe(event, handler)` | Register a subscriber (returns builder for ordering) |
| `fire(event, payload)` | Emit an event, run subscribers, return tick result |
| `graph()` | Introspect the subscriber ordering graph |
| `onFieldChange(name, cb)` | Watch a field for changes (returns unsub function) |
| `tick` | Monotonic tick counter (read-only) |

### `fire(event, payload): TickResult<S>`

```ts
const result = system.fire(damageTaken, { amount: 15 })
// result: { state: S, chain: Chain<S>, tick: number, event: string }
```

### `onFieldChange(name, callback): () => void`

Subscribe to changes on a specific field. The callback fires after every successful tick that modifies the field. Returns an unsubscription function.

```ts
const unsub = system.onFieldChange('hp', (newVal, oldVal, fieldName) => {
  console.log(`${fieldName}: ${oldVal} → ${newVal}`)
})
// later: unsub()
```

### `graph(): Map<string, string[]>`

Returns the subscriber dependency graph as adjacency lists. Each entry lists the subscriber's `before` targets; `after` targets are prefixed with `←`. Useful for debugging ordering.

## Global Helpers

### `useSystem(sys: System): void`
### `getSystem(): System | null`

Set or retrieve the active system singleton. Required by the view layer and the standalone `subscribe()` function.

```ts
import { createSystem, useSystem } from 'mechflow'

const system = createSystem({ fields: [...], events: [...] })
useSystem(system)
// Now system is available to subscribe(), bindComponent(), etc.
```

## Subscriptions

### `subscribe(event, handler): SubscriptionBuilder` (standalone)
### `system.subscribe(event, handler): SubscriptionBuilder` (method)

Register a subscriber. The standalone form requires a prior `useSystem()` call; the method form is always preferred for type safety as it preserves the full `S` type.

```ts
system.subscribe(damageTaken, (ctx) => {
  return Ok({ hp: ctx.chain.current.hp - ctx.payload.amount })
})
  .id('raw-damage')
  .after('armor-soak')
  .before('heal-process', 'enrage-check')
  .priority('early')
```

### SubscriberHandler

```
(ctx: SubscriberContext<E, S>) => Result<Partial<S>, SubscriberError>
```

Receives the full context and returns either a delta (partial state update) or an error.

### SubscriptionBuilder

```
SubscriptionBuilder {
  id(name: string): this
  before(...ids: string[]): this
  after(...ids: string[]): this
  priority(hint: 'early' | 'late'): this
}
```

| Method | Description |
|--------|-------------|
| `.id(name)` | Unique identifier for ordering references |
| `.before(...ids)` | Subscriber IDs this must run before |
| `.after(...ids)` | Subscriber IDs this must run after |
| `.priority(hint)` | Soft hint: schedule as early or late as constraints allow |

An ID is required when any other subscriber references this one via `before`/`after`. Anonymous subscribers are allowed but cannot be ordered relative to.

## Chain

The chain is an ordered list of links passed to every subscriber within a tick. It is append-only — each subscriber appends a new link (success or error).

```
Chain<S> {
  readonly first: S
  readonly current: S
  readonly unsafeCurrent: S
  readonly links: readonly ChainLink<S>[]
  at(index: number): ChainLink<S> | undefined
  find(id: string): ChainLink<S> | undefined
  [Symbol.iterator](): Iterator<ChainLink<S>>
}

ChainLink<S> {
  state: S
  error?: SubscriberError
  subscriberId: string
}
```

| Accessor | Description |
|----------|-------------|
| `first` | Initial state at tick start |
| `current` | State of the last successful link (skips errors) |
| `unsafeCurrent` | State of the last link regardless |
| `at(n)` | Relative index lookup (`at(-1)` = last link) |
| `find(id)` | Find a link by subscriber ID |
| Iterable | `for (const link of chain)` loops over all links |

## Subscriber Context

```
SubscriberContext<E, S> {
  chain: Chain<S>
  tick: number
  payload: E
  event: string
}
```

| Field | Description |
|-------|-------------|
| `chain` | The append-only resolution chain |
| `tick` | Monotonic tick counter, increments per event |
| `payload` | The typed event payload (type `E`) |
| `event` | The event name that triggered this tick |

## Result

Subscribers return `Result<Partial<S>, SubscriberError>` (lightweight discriminated union):

```ts
import { Ok, Err } from 'mechflow'

// Success — delta is merged into state, link appended
return Ok({ hp: ctx.chain.current.hp - 5 })

// Failure — no delta applied, error link appended
return Err({ message: 'not enough rage', meta: { rage: ctx.chain.current.rage } })
```

`SubscriberError` is a plain object with `message: string` and optional `meta?: Record<string, unknown>`. It is not a class — always use the plain object form.

## Component Registration

### `flow(name: string, template: HTMLTemplateElement): void`

Register a Web Component from a `<template>` element. Handles shadow DOM attachment, binding walker initialization, and lifecycle cleanup.

```ts
const template = document.getElementById('hp-bar-template')
flow('hp-bar', template)
```

The binding attributes (`mf-text`, `mf-bind:*`, `mf-toggle`, `mf-on:*`) are resolved automatically at runtime. No component class boilerplate is needed.

**Browser-only.** Requires `customElements`, `ShadowRoot`, and DOM APIs.

## View Binding Attributes

| Attribute | Example | Description |
|-----------|---------|-------------|
| `mf-text` | `mf-text="hp"` | Sets `textContent` to the field's current value |
| `mf-bind:*` | `mf-bind:style="width:{0}% \| hpPercent"` | Binds an attribute to formatted field values |
| `mf-toggle` | `mf-toggle="bloodied"` | Sets `hidden` property based on field truthiness |
| `mf-on:*` | `mf-on:click="takeDamage:5"` | Wires a DOM event to fire a system event |

### mf-bind format

```
template | field1, field2, ...
```

`{0}` is replaced by `field1`'s value, `{1}` by `field2`'s, etc. A single field with no pipe uses implicit `{0}`:

```html
<!-- Single field, implicit {0} -->
<div mf-bind:class="healthClass"></div>

<!-- Multiple fields with template -->
<div mf-bind:style="width:{0}%; background:{1} | hpPercent, hpColor"></div>
```

Special case: `mf-bind:style` sets `el.style.cssText` directly.

### mf-on format

```
eventName:arg1,arg2
```

The DOM event fires `system.fire(eventName, [arg1, arg2])`. Args are passed as raw string arrays. For typed payloads, use a subscriber registered via `system.subscribe()` and fire manually from a script.
