# MechFlow View Binding

## Concept

Views are Web Components that connect HTML templates to the reactive core through declarative binding attributes in the shadow DOM. A tiny runtime resolves these attributes in `connectedCallback`, subscribes to the appropriate fields, and updates the DOM when values change.

No build step is required. Templates are served as raw HTML.

## Attribute Reference

### `s-text`

Sets `textContent` of an element to a field's value:

```html
<span s-text="hp"></span>
```

### `s-bind`

Binds an attribute to a field value:

```html
<div class="hp-fill" s-bind:style="hpPercent"></div>
<input s-bind:disabled="isDead">
```

The attribute value can include a pipe-separated transformation:

```html
<div s-bind:style="hpPercent | width:{0}%"></div>
```

### `s-toggle`

Toggles a CSS class based on a boolean field:

```html
<div s-toggle="bloodied">Bloodied!</div>
<div s-toggle="isDead | hidden">Dead</div>
```

### `s-on`

Wire DOM events to event emitter calls:

```html
<button s-on:click="takeDamage:5">Hit</button>
```

The value format is `eventName:arg1,arg2` — calls `system.fire(eventName, args)`.

## Initialization

A base class or mixin provides the binding lifecycle:

```js
class MechComponent extends HTMLElement {
  connectedCallback() {
    walkBindings(this.shadowRoot).for((attr, field, transform) => {
      subscribe(field, (value) => {
        applyBinding(this, attr, transform(value))
      })
    })
  }
}
```

A custom element author imports the base class and provides the template:

```js
class HpBar extends MechComponent {
  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.shadowRoot.append(hpTemplate.content.cloneNode(true))
  }
}
customElements.define('hp-bar', HpBar)
```

## Lifecycle

| Phase | Action |
|-------|--------|
| `constructor` | Attach shadow DOM, clone template |
| `connectedCallback` | Walk bindings, subscribe to fields |
| Update received | Apply attribute/text/class change to matched element |
| `disconnectedCallback` | Unsubscribe all bindings |
| `attributeChangedCallback` | Not used by binding system; available for manual overrides |

## Scope

Bindings resolve field names against the system's field registry. A component can opt into a specific scope by setting the `s-scope` attribute on the host element:

```html
<hp-bar s-scope="player-1"></hp-bar>
```

The scope is passed through to `subscribe(field, handler, { scope })`, allowing the same component template to bind to different state instances.

## Constraints

- All binding resolution happens at runtime — no build step
- Transform functions are registered globally or per-component
- Unsubscription is automatic in `disconnectedCallback`
- Multiple elements can bind to the same field; all update on change
