# MechFlow

Reactive state management for web components with explicit ordering, typed events, and no magic.

- **17KB** self-contained ESM bundle — zero runtime dependencies
- **~100,000 ticks/sec** with 10 subscribers (well under 0.1ms per tick)
- **~900 ticks/sec** with 2000 subscribers (~1.1ms per tick — fitting 14 ticks within a 60fps frame)

## Core Idea

State is a flat map of named fields. Events trigger ticks. Each tick runs subscribers in a resolved total order derived from explicit `before`/`after` constraints. Subscribers return `Result<Delta, SubscriberError>` — Ok applies the delta, Err appends an error link without changing state. The chain of all deltas is passed to each subscriber, providing a complete audit trail within a tick.

No implicit dependency tracking. No computed properties. No merge strategies. Ordering IS the merge strategy — later writer wins per field.

## Quick Start

```ts
import { field, event, createSystem, Ok } from 'mechflow'

// 1. Define fields
const hp = field('hp', { default: 20 })
const status = field('status', { default: 'healthy' as string })

// 2. Define events
interface DamageEvent { amount: number }
const damageTaken = event<DamageEvent>('damage:taken')

// 3. Create system
const system = createSystem({
  fields: [hp, status],
  events: [damageTaken],
})

// 4. Register subscribers
system.subscribe(damageTaken, (ctx) => {
  return Ok({ hp: ctx.chain.current.hp - ctx.payload.amount })
}).id('apply-damage')

system.subscribe(damageTaken, (ctx) => {
  if (ctx.chain.current.hp <= 10) {
    return Ok({ status: 'bloodied' })
  }
  return Ok({})
}).id('bloodied-check').after('apply-damage')

// 5. Fire events
const result = system.fire(damageTaken, { amount: 5 })
console.log(result.state) // { hp: 15, status: 'healthy' }
```

## View Layer (Browser)

MechFlow provides declarative web component bindings via `flow()` and `mf-*` attributes:

```html
<template id="hp-bar">
  <div>
    <div mf-bind:style="width:{0}% | hpPercent" class="hp-fill"></div>
    <span mf-text="hp"></span> / <span mf-text="hpMax"></span>
    <div mf-toggle="bloodied">BLOODIED</div>
  </div>
</template>

<script type="module">
  import { flow, useSystem } from './mod.js'
  import { system } from './my-system.js'

  useSystem(system)
  flow('hp-bar', document.getElementById('hp-bar'))
</script>
```

Attributes are resolved at runtime in `connectedCallback`. No build step required for templates.

## Design Docs

| Doc | What it covers |
|-----|---------------|
| [ABSTRACT.md](ABSTRACT.md) | Core principles, tick model, error handling, architecture |
| [API.md](API.md) | Full API reference |
| [TICK_LIFECYCLE.md](TICK_LIFECYCLE.md) | Walkthrough of a single tick |
| [ORDERING.md](ORDERING.md) | Partial ordering, topological sort, priority hints |
| [VIEW_BINDING.md](VIEW_BINDING.md) | Declarative mf-* binding attributes |
| [TYPE_SYSTEM.md](TYPE_SYSTEM.md) | TypeScript integration and type inference |

## Tests

```sh
# Core unit tests
deno task test

# Chromium headless e2e test (requires chromium-browser)
deno run --no-check --allow-all src/e2e_test.ts
```

## Build

### Library bundle (browser / npm)

```sh
deno task build
```

Produces `dist/mechflow.js` — a self-contained ESM bundle for browser use. No runtime dependencies.

### Testbed

```sh
deno task build-testbed
```

Produces `testbed/main.js` from `testbed/main.ts`. Open `testbed/index.html` in a browser.
