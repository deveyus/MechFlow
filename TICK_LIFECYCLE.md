# MechFlow Tick Lifecycle

A tick is a single event cycle — from event fire through all subscribers to a resolved final state.

## Phases

### 1. Event Initiation

Something calls `system.fire(event, payload)`. The system:
- Increments the monotonic tick counter
- Locks the current state as the base

### 2. Chain Initialization

A new chain is created with one initial link:

```
[{ state: currentState, subscriberId: '__init__' }]
```

`chain.first` points here. This link has no subscriber and no error — it is the baseline.

### 3. Subscriber Resolution

The system traverses the resolved total order (computed at boot from all `before`/`after` constraints). For each subscriber:

```
for each subscriberId in resolvedOrder:
    subscriber = registry[subscriberId]
    context = { chain, tick, payload, event }
    result   = subscriber.handler(context)

    if result is Ok(delta):
        newState = merge(chain.current, delta)
        chain.append({ state: newState, subscriberId })
    else:
        chain.append({
            state:      chain.current,
            subscriberId,
            error:      result.error
        })
```

- `chain.current` always returns the last **successful** state (skips error links)
- `chain.unsafeCurrent` returns the last link's state (identical to current after a success, same as previous after an error)
- Subscribers that fail do not mutate state — their link carries the same state as the prior link plus the error

### 4. Tick Completion

After all subscribers have run:

```
tickResult = {
    state:  chain.current,     // last successful state
    chain:  chain,             // complete trace including errors
    tick:   tick,              // monotonic tick ID
    event:  eventName,         // originating event
}
```

The system stores `chain.current` as the new base state for the next tick.

## Key Properties

- **Sequential** — subscribers run one at a time, each seeing the accumulated state
- **Append-only** — the chain is never mutated, only extended
- **Fail-continue** — errors never abort the tick; all subscribers run
- **Deterministic** — same subscribers + same initial state + same event = same final state
- **Observable** — the chain is the complete audit log of the tick

## Tick Lifecycle Diagram

```
fire(event, payload)
  │
  ├─ tick++
  ├─ chain = [{ state: base }]
  │
  ├─ for each subscriber in resolved order:
  │     ├─ handler(chain) → Result
  │     ├─ Ok?   → chain.append(newState)
  │     └─ Err?  → chain.append(sameState, error)
  │
  └─ return { state: chain.current, chain }
         │
         base = chain.current
```

## Error States

| Condition | Behavior |
|-----------|----------|
| Subscriber returns `Err` | Error link appended, state unchanged, tick continues |
| Subscriber throws (should not happen per constraint) | Caught and converted to `Err`, tick continues |
| Cycle in ordering graph | Detected at boot, system refuses to start |
| Unknown subscriber ID in `before`/`after` | Warning at boot, edge ignored |
