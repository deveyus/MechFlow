# MechFlow API Reference

## Fields

### `field<T>(name: string, options: FieldOptions<T>): Field<T>`

Define a named field with a default value and type.

```ts
const hp = field<number>('hp', { default: 20 })
const status = field<Status>('status', { default: 'healthy' })
```

`Field<T>` carries its type through the chain for full inference. Fields are the atomic units of state — subscribers produce deltas that target specific fields.

## Events

### `event<E = void>(name: string): Event<E>`

Define a named event that subscribers can listen for.

```ts
const damageTaken = event<{ amount: number }>('damage:taken')
const turnStart = event('turn:start')
```

Events carry an optional typed payload that subscribers receive in their context.

## Subscriptions

### `subscribe<E, S>(event: Event<E>, handler: SubscriberHandler<E, S>, options?: SubscriberOptions): Subscription`

Register a subscriber to run when an event fires.

```ts
subscribe(damageTaken, (ctx) => {
  return Ok({ hp: ctx.current.hp - ctx.payload.amount })
}, {
  after: armorSoak,
  id: 'raw-damage'
})
```

### SubscriberHandler

```
(ctx: SubscriberContext<E, S>) => Result<Partial<S>, SubscriberError>
```

Receives the full context and returns either a delta (partial state update) or an error.

### SubscriberOptions

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | Unique identifier for ordering references |
| `before` | `string \| string[]` | Subscriber IDs this must run before |
| `after` | `string \| string[]` | Subscriber IDs this must run after |

## Chain

The chain is an ordered list of links passed to every subscriber within a tick:

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

- `first` — initial state at tick start
- `current` — state of the last successful link (skips errors)
- `unsafeCurrent` — state of the last link regardless
- `at(n)` — relative index lookup (`at(-1)` = last)
- `find(id)` — find a link by subscriber ID
- Iterable — for-of loops over all links

## Subscriber Context

```
SubscriberContext<E, S> {
  chain: Chain<S>
  tick: number
  payload: E
  event: string
}
```

- `chain` — the append-only resolution chain
- `tick` — monotonic tick counter, increments per event
- `payload` — the typed event payload
- `event` — the event name that triggered this tick

## Result

Subscribers return `Result<Partial<S>, SubscriberError>` from `ts-results-es`:

```ts
import { Ok, Err } from 'ts-results-es'

// Success — delta is merged into state, link appended
return Ok({ hp: ctx.current.hp - 5 })

// Failure — no delta applied, error link appended
return Err(new SubscriberError('not enough rage', { rage: ctx.current.rage }))
```

## System

### `createSystem(config: SystemConfig): System`

Create a MechFlow system instance. Resolves all partial ordering constraints into a total order at boot.

```ts
const system = createSystem({
  fields: [hp, status, rage],
  events: [damageTaken, turnStart, healApplied],
})
```

### `System`

```
System {
  field(name): Field
  event(name): Event
  fire(event, payload): TickResult
  tick: number
}
```

- `fire(event, payload)` — emit an event, run subscribers, return the final tick result
- `tick` — current tick counter (read-only)
