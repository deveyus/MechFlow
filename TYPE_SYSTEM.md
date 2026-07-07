# MechFlow TypeScript Integration

## Concept

MechFlow leverages TypeScript's type system to provide end-to-end type safety through the full reactive pipeline — from field definition, through subscription, to delta application. The goal is zero runtime type checking; all validation happens at compile time.

## Field Type Carrying

A `Field<T>` carries its value type as a generic parameter:

```ts
const hp     = field<number>('hp',    { default: 20 })
const status = field<Status>('status', { default: 'healthy' })
const name   = field<string>('name',  { default: '' })
```

The field's type is branded — `Field<T>` is structurally unique per name, preventing cross-field assignment errors at the type level.

## System Type Inference

`createSystem` infers the full state shape from its field list:

```ts
const system = createSystem({
  fields: [hp, status, name],
})

// Inferred:
// system.state = {
//   hp:     number
//   status: Status
//   name:   string
// }
```

This inferred type flows into all subscribers, chains, and tick results.

## Typed Events

Events carry a typed payload:

```ts
const damage = event<{ amount: number; source: string }>('damage:taken')
const heal   = event<{ amount: number }>('heal:applied')
const tick   = event<void>('turn:start')
```

The payload type is available on the subscriber context:

```ts
subscribe(damage, (ctx) => {
  // ctx.payload.amount  → number (inferred)
  // ctx.payload.source  → string (inferred)
  return Ok({ hp: ctx.current.hp - ctx.payload.amount })
})
```

## Typed Subscribers

The subscriber handler is fully typed from both ends:

```ts
subscribe(damage, (ctx: SubscriberContext<typeof damage, typeof system>) => {
  // ctx.chain.current.hp      → number
  // ctx.chain.first.status    → Status
  // ctx.payload.amount        → number
  // ctx.tick                  → number
  return Ok({ hp: ctx.current.hp - ctx.payload.amount })
})
```

The `SubscriberContext<E, S>` generic picks up:
- `E` — the event payload type (from the event definition)
- `S` — the state type (from the system definition)

## Return Type Checking

The delta object is type-checked against the state type:

```ts
// Compile error: 'hps' is not a field
return Ok({ hps: 15 })

// Compile error: string is not assignable to number
return Ok({ hp: 'low' })

// Valid
return Ok({ hp: 15, status: 'bloodied' })
```

## Chain Navigation

Chain accessors are fully typed:

```ts
ctx.chain.current    // S — the full state type
ctx.chain.first      // S — the full state type
ctx.chain.at(-1)     // ChainLink<S> | undefined
ctx.chain.find('heal') // ChainLink<S> | undefined
```

## Ordering Reference Safety

Subscriber IDs used in `before`/`after` are validated against a union type derived from all registered subscribers:

```ts
subscribe(damage, handler, {
  id: 'apply-damage',
  after: 'nonexistent-id',  // Compile error if 'nonexistent-id' not in subscriber IDs
})
```

This prevents ordering references to subscribers that don't exist.

## Type Relationships

```
Field<T>           → carries value type T, branded by name
Event<E>           → carries payload type E
System<S>          → carries state type S (inferred from fields)
Subscriber<E, S>   → carries event type E and state type S
Chain<S>           → carries state type S
Result<T, E>       → standard Ok/Err discriminated union
```
