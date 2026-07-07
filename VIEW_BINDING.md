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

Toggles a CSS class based on a boolean field:

```html
<div mf-toggle="bloodied">Bloodied!</div>
```

### `mf-on`

Wire DOM events to event emitter calls:

```html
<button mf-on:click="takeDamage:5">Hit</button>
```

The value format is `eventName:arg1,arg2` — calls `system.fire(eventName, args)`.

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

## Scope

Bindings resolve field names against the system's field registry. A component can opt into a specific scope by setting the `mf-scope` attribute on the host element:

```html
<hp-bar mf-scope="player-1"></hp-bar>
```

The scope is passed through to the subscription layer, allowing the same component template to bind to different state instances.

## Constraints

- All binding resolution happens at runtime — no build step
- Transform functions are registered globally or per-component
- Unsubscription is automatic in `disconnectedCallback`
- Multiple elements can bind to the same field; all update on change
