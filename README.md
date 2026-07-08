# MechFlow

**Deterministic state management for applications that can't afford surprises.**

A zero-dependency reactive library where ordering is declared, errors never abort, and every state change leaves a receipt.

---

## 1. The Basics: an event, a subscriber, a state change

State is a flat map of named fields. The only way to change it is by firing an event. A subscriber receives the event payload and returns the fields it wants to update.

```ts
import { field, event, createSystem, Ok } from 'mechflow'

const balance = field('balance', { default: 0 })
const deposited = event<{ amount: number }>('deposited')
const sys = createSystem({ fields: [balance], events: [deposited] })

// Add the deposit to the balance — inline lambda for simple one-liner
sys.subscribe(deposited, ctx =>
  Ok({ balance: ctx.chain.current.balance + ctx.payload.amount })
)

// Same intent, written as a named function: read the current balance from
// the chain, compute the sum, return the new balance as a delta
function addToBalance(ctx) {
  const newBalance = ctx.chain.current.balance + ctx.payload.amount
  return Ok({ balance: newBalance })
}
sys.subscribe(deposited, addToBalance)

const r = sys.fire(deposited, { amount: 50 })
console.log(r.state) // { balance: 50 }
```

One field. One event. One subscriber. Fire → delta → new state. That's the core loop.

---

## 2. Ordering: when two subscribers depend on each other

Add a second subscriber that needs to run *after* the first. Declare the relationship with `.after()`:

```ts
import { field, event, createSystem, Ok } from 'mechflow'

const balance = field('balance', { default: 100 })
const flag = field('flag', { default: '' as string })
const withdrew = event<{ amount: number }>('withdrew')
const sys = createSystem({ fields: [balance, flag], events: [withdrew] })

// Deduct the withdrawal amount from the balance — inline lambda returns
// the new balance as a delta
sys.subscribe(withdrew, ctx =>
  Ok({ balance: ctx.chain.current.balance - ctx.payload.amount })
).id('deduct')

// Determine account status after the deduction runs: read the updated
// balance from the chain, check if it went negative, then set the flag
function checkOverdrawn(ctx) {
  const status = ctx.chain.current.balance < 0 ? 'overdrawn' : 'clear'
  return Ok({ flag: status })
}
sys.subscribe(withdrew, checkOverdrawn).id('check').after('deduct')

const r = sys.fire(withdrew, { amount: 150 })
console.log(r.state) // { balance: -50, flag: 'overdrawn' }
```

The `check` subscriber sees the `balance` that `deduct` produced. It can also reach back with `ctx.chain.find('deduct')` to inspect any prior subscriber's delta or error.

The system validates the full ordering graph at registration time. If you create a cycle, it throws immediately with the cycle path — not at runtime.

---

## 3. Errors: failing without aborting

A subscriber returns `Err(error)` instead of `Ok(delta)` to signal failure. The error is recorded on the chain. The tick continues — all remaining subscribers still run.

```ts
import { field, event, createSystem, Ok, Err } from 'mechflow'

const balance = field('balance', { default: 100 })
const log = field('log', { default: '' as string })
const withdrew = event<{ amount: number }>('withdrew')
const sys = createSystem({ fields: [balance, log], events: [withdrew] })

// Validate the withdrawal: return Err if the amount exceeds the current
// balance, otherwise return Ok with the new balance
sys.subscribe(withdrew, ctx =>
  ctx.payload.amount > ctx.chain.current.balance
    ? Err(new Error('insufficient funds'))
    : Ok({ balance: ctx.chain.current.balance - ctx.payload.amount })
).id('deduct')

// Record the audit trail: look up deduct's result in the chain, check
// whether it errored, then set the log entry accordingly
function audit(ctx) {
  const prev = ctx.chain.find('deduct')
  const entry = prev?.error ? `failed: ${prev.error.message}` : 'approved'
  return Ok({ log: entry })
}
sys.subscribe(withdrew, audit).id('audit').after('deduct')

const ok = sys.fire(withdrew, { amount: 50 })
console.log(ok.state)         // { balance: 50, log: 'approved' }
console.log(ok.chain.find('deduct')?.error)  // undefined

const fail = sys.fire(withdrew, { amount: 999 })
console.log(fail.state)       // { balance: 50, log: 'failed: insufficient funds' }
console.log(fail.chain.find('deduct')?.error?.message)  // 'insufficient funds'
```

Notice: on the second fire, `deduct` returned `Err`, so `balance` stayed at 50. But `audit` still ran — it read the error from the chain and set `log` accordingly.

**Every subscriber runs, regardless of prior errors.** Errors are values, not exceptions. There is no corrupt state, no silent rollback, no partial update.

---

## Why not X?

Every state library makes tradeoffs. Here's how MechFlow compares:

| Concern | Redux | MobX / Signals | Zustand | **MechFlow** |
|---------|-------|---------------|---------|-------------|
| **Subscriber ordering** | Middleware chain only; reducer-to-reducer order is undefined | Not declared — depends on which computed was observed first | Not declared — hooks fire in component tree order | **Declared with `before`/`after`** |
| **Error isolation** | One reducer throws, the whole store is undefined | A computed throws, the reactive graph poisons | A subscriber throws, the whole update drops | **Per-subscriber `Result` — failing never aborts the tick** |
| **Audit trail** | DevTools only in development | None | None | **Chain object is always produced — production-grade tracing** |
| **Dependency tracking** | Manual `mapStateToProps`, selectors | Implicit (getter interception) | Manual selectors, shallow compare | **Explicit — subscribers declare inputs via the chain** |
| **Bundle size** | ~12KB (RTK) | ~16KB | ~2KB | **17KB self-contained** |
| **Runtime deps** | Immer, Redux core, thunks etc. | None | None | **Zero** |

---

## When to use MechFlow

- You need multi-step processing of events where **order matters** (payment → fraud check → audit log)
- You want **provable error resilience** — a failed validation step shouldn't silently roll back a successful prior step, and it shouldn't prevent the audit step from running
- You want a **production-grade audit trail** — every tick produces a chain object you can log, inspect, or replay
- You want to **trust correctness** — the system validates the ordering graph at registration time; cycles throw with the full path before any state is touched

## When NOT to use MechFlow

- You have a simple counter or toggle — `useState` is fine. MechFlow pays for ordering and error isolation you don't need yet.
- You want fully automatic reactivity (MobX/Signals) — MechFlow requires you to declare what depends on what. That's deliberate overhead for correctness.
- You need routing, data fetching, or a build tool — MechFlow is state + view bindings only. Bring your own framework.
- You're shipping to IE11 — the bundle uses modern JavaScript with no polyfills.

---

## Core Concepts (Reference)

**Fields** are named state slots with a default value. They define the shape of the system and enable full TypeScript inference:
```ts
const hp = field('hp', { default: 100 })  // type: Field<number, 'hp'>
```

**Events** carry typed payloads. An interface defines the shape; `event()` wraps it:
```ts
interface DamageEvent { amount: number }
const damaged = event<DamageEvent>('damaged')
```

**Subscribers** are functions that receive `{ chain, payload, tick, event }` and return `Result<Delta, Error>`:
```ts
function applyDamage(ctx) {
  return Ok({ hp: ctx.chain.current.hp - ctx.payload.amount })
}
sys.subscribe(damaged, applyDamage).id('apply-damage')
```

**The Chain** is the ordered list of every subscriber's result within a tick:
- `chain.first` — state when the event started
- `chain.current` — state of the last successful subscriber (skips error links)
- `chain.unsafeCurrent` — state of the last subscriber regardless
- `chain.find(id)` — find a subscriber's result by its declared id
- Chain is iterable — `for (const link of chain)` over the full history

A subscriber can inspect any prior subscriber's state, delta, or error via `ctx.chain.find('some-subscriber-id')`.

## Error Handling

Errors are **never thrown** — they're returned as values and recorded on the chain.

```ts
sys.subscribe(charged, ctx => {
  return ctx.payload.amount > ctx.chain.current.creditLimit
    ? Err(new Error('card declined'))
    : Ok({ balance: ctx.chain.current.balance - ctx.payload.amount })
}).id('authorize').before('receipt')

sys.subscribe(charged, ctx => {
  const auth = ctx.chain.find('authorize')
  return ctx.payload.amount > 10000 && !auth?.error
    ? Ok({ fraudFlag: true })
    : Ok({ fraudFlag: false })
}).id('fraud-check').after('receipt')
```

If `authorize` fails, `balance` is not changed, but `fraud-check` still runs — it can inspect the error and react accordingly. All subscribers run regardless of prior errors.

The state is always deterministic: errors leave the previous successful state in place. There is no partial update, no corrupt state, no silent rollback.

## Explicit Ordering

Order is declared at subscription time, not discovered at runtime:

```ts
sys.subscribe(event, handler).id('c').after('a').before('b')
```

The system resolves the graph using Kahn's topological sort. If you introduce a cycle, it throws immediately at registration time — with the full cycle path — rather than failing silently at runtime.

**Priority hints** (`'early'` | `'late'`) provide soft ordering within the same topological layer. They never override hard `before`/`after` edges.

## View Layer (Browser)

Declarative Web Component bindings with zero build step for templates:

```html
<template id="status-bar">
  <div>
    <div mf-bind:style="width:{0}% | hpPercent" class="hp-fill"></div>
    <span mf-text="hp"></span> / <span mf-text="hpMax"></span>
    <div mf-toggle="bloodied">CRITICAL</div>
    <button mf-on:click="takeDamage:5">Hurt</button>
  </div>
</template>

<script type="module">
  import { flow, useSystem } from 'mechflow'
  import { system } from './game-state.js'

  useSystem(system)
  flow('status-bar', document.getElementById('status-bar'))
</script>
```

Current binding attributes:
- `mf-text="fieldName"` — sets `textContent` reactively
- `mf-bind:attr="template | field1, field2"` — binds an attribute from one or more fields using `{0}`, `{1}` positional references
- `mf-toggle="fieldName"` — toggles `element.hidden` based on truthiness
- `mf-on:event="handlerName:payload"` — wires DOM events to system events with optional payload parsing

All attributes are resolved at runtime in `connectedCallback`. No build step required.

## Performance

Tick throughput on commodity hardware (single thread, no JIT warmup):

| Subscribers | Time per tick | Ticks within 16ms (60fps) |
|------------|---------------|--------------------------|
| 10 | ~0.01ms | ~1,600 |
| 100 | ~0.06ms | ~260 |
| 500 | ~0.28ms | ~57 |
| 2000 | ~1.12ms | ~14 |

The hot path is a flat array dispatch with a reusable context object — no closures, no Map lookups, no class instantiation in the inner loop.

**Bundle:** 17KB self-contained ESM (zero runtime dependencies).

## Install

MechFlow is published on GitHub Packages under the `@deveyus` scope.

```sh
# npm — requires GitHub auth
# Create a .npmrc with:
#   @deveyus:registry=https://npm.pkg.github.com
#   //npm.pkg.github.com/:_authToken=<your-gh-pat>
npm install @deveyus/mechflow

# Deno — from source (no auth needed)
deno add jsr:@deveyus/mechflow
```

## Build

```sh
deno task build        # → dist/mechflow.js (self-contained ESM bundle)
deno task build-testbed # → testbed/main.js
```

## Tests

```sh
deno task test                  # Core unit tests
deno run src/e2e_test.ts        # Chromium headless e2e
```

## Design Docs

| Doc | What it covers |
|-----|---------------|
| [ABSTRACT.md](ABSTRACT.md) | Core principles, tick model, architecture |
| [API.md](API.md) | Full API reference |
| [TICK_LIFECYCLE.md](TICK_LIFECYCLE.md) | Walkthrough of a single tick |
| [ORDERING.md](ORDERING.md) | Partial ordering, topological sort, priority |
| [VIEW_BINDING.md](VIEW_BINDING.md) | Declarative mf-* binding attributes |
| [TYPE_SYSTEM.md](TYPE_SYSTEM.md) | TypeScript integration and type inference |

## License

EUPL-1.2 — see [LICENSE](LICENSE).
