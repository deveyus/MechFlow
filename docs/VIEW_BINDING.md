# MechFlow View Binding

## Concept

Views are Web Components that connect HTML templates to the reactive core through declarative binding attributes in the shadow DOM. A tiny runtime resolves these attributes in `connectedCallback`, subscribes to the appropriate fields, and updates the DOM when values change.

No build step is required. Templates are served as raw HTML.

## Attribute Reference

### `mf-text`

Sets `textContent` of an element to a field's value:

```html
<span mf-text="hp"></span>
```

### `mf-bind`

Binds an attribute to one or more field values using positional template syntax:

```html
<div mf-bind:style="width:{0}% | hpPercent"></div>
<div mf-bind:style="width:{0}%; background:{1} | hpPercent, hpColor"></div>
<input mf-bind:disabled="isDead">
```

The format is `template | field1, field2, ...`. `{0}` is replaced by field1's value, `{1}` by field2's, etc.

### `mf-toggle`

Shows or hides an element by setting the `hidden` property based on a boolean field:

```html
<div mf-toggle="bloodied">Bloodied!</div>
```

### `mf-on`

Wire DOM events to event emitter calls:

```html
<button mf-on:click="takeDamage:5">Hit</button>
```

The value format is `eventName:arg1,arg2` — calls `system.fire(eventName, args)`.

### `mf-model`

Two-way binding for form inputs. Sets the input's value from the field, and updates the field (with a configurable debounce) when the user types:

```html
<input mf-model="characterName">
<input mf-model="hp" type="number">
```

Values are parsed as numbers when possible (matching `tryParseNumber` behavior). The debounce defaults to 200ms and flushes on blur — intermediate keystrokes are local to the input until the debounce fires or the element loses focus. Configure globally:

```ts
import { setModelDebounce } from 'mechflow'
setModelDebounce(300) // global default, applied to all mf-model bindings
```

Under the hood, `mf-model` calls `system.writeField()` — a direct state mutation that bypasses the event pipeline. This is intentional: form inputs are UI convenience, not business logic.

## Initialization

A single function call registers a template as a live web component:

```ts
import { flow } from 'mechflow'
import html from './hp-bar.html' with { type: 'html' }

flow('hp-bar', html)
```

`flow()` handles shadow DOM attachment, binding walker initialization, and lifecycle cleanup automatically. No class definition, no `connectedCallback`, no `customElements.define()`.

## Lifecycle

| Phase | Action |
|-------|--------|
| `constructor` | Attach shadow DOM, clone template |
| `connectedCallback` | Walk bindings, subscribe to fields |
| Update received | Apply attribute/text/class change to matched element |
| `disconnectedCallback` | Unsubscribe all bindings |
| `attributeChangedCallback` | Not used by binding system; available for manual overrides |

## Constraints

- All binding resolution happens at runtime — no build step
- Unsubscription is automatic in `disconnectedCallback`
- Multiple elements can bind to the same field; all update on change
