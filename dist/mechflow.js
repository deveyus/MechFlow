// src/core/chain.ts
function createChain(initial) {
  const links = [
    { state: initial, subscriberId: "__init__" }
  ];
  function lastSuccessIndex() {
    for (let i = links.length - 1; i >= 0; i--) {
      if (!links[i].error) return i;
    }
    return 0;
  }
  const chain = {
    get first() {
      return links[0].state;
    },
    get current() {
      return links[lastSuccessIndex()].state;
    },
    get unsafeCurrent() {
      return links[links.length - 1].state;
    },
    get links() {
      return links;
    },
    at(index) {
      if (index < 0) index = links.length + index;
      return links[index];
    },
    find(id) {
      return links.find((l) => l.subscriberId === id);
    },
    [Symbol.iterator]() {
      return links[Symbol.iterator]();
    },
    append(state, subscriberId, error) {
      links.push({ state, subscriberId, error });
    }
  };
  return chain;
}

// src/core/ordering.ts
function resolveOrdering(subscribers) {
  const vertices = new Set(subscribers.map((s) => s.id));
  const adjacency = /* @__PURE__ */ new Map();
  const inDegree = /* @__PURE__ */ new Map();
  for (const id of vertices) {
    adjacency.set(id, []);
    inDegree.set(id, 0);
  }
  for (const sub of subscribers) {
    for (const target of sub.before) {
      if (vertices.has(target)) {
        adjacency.get(sub.id).push(target);
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      } else {
        console.warn(`ordering: subscriber "${sub.id}" references unknown id "${target}" in before()`);
      }
    }
    for (const target of sub.after) {
      if (vertices.has(target)) {
        adjacency.get(target).push(sub.id);
        inDegree.set(sub.id, (inDegree.get(sub.id) ?? 0) + 1);
      } else {
        console.warn(`ordering: subscriber "${sub.id}" references unknown id "${target}" in after()`);
      }
    }
  }
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  if (queue.length === 0 && vertices.size > 0) {
    return { order: [], cycle: detectCycle(adjacency, vertices) };
  }
  const order = [];
  while (queue.length > 0) {
    const id = queue.shift();
    order.push(id);
    for (const neighbor of adjacency.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }
  if (order.length !== vertices.size) {
    const remaining = new Set(vertices);
    for (const id of order) remaining.delete(id);
    return {
      order,
      cycle: detectCycle(adjacency, remaining)
    };
  }
  return { order: applyPriorities(order, subscribers, adjacency) };
}
function detectCycle(adjacency, vertices) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = /* @__PURE__ */ new Map();
  const parent = /* @__PURE__ */ new Map();
  for (const v of vertices) color.set(v, WHITE);
  let cycle = [];
  function dfs(node) {
    color.set(node, GRAY);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!vertices.has(neighbor)) continue;
      if (color.get(neighbor) === GRAY) {
        let cur = node;
        const path = [neighbor, node];
        while (cur !== neighbor && cur !== null) {
          cur = parent.get(cur) ?? null;
          if (cur) path.push(cur);
        }
        cycle = path.reverse();
        return true;
      }
      if (color.get(neighbor) === WHITE) {
        parent.set(neighbor, node);
        if (dfs(neighbor)) return true;
      }
    }
    color.set(node, BLACK);
    return false;
  }
  for (const v of vertices) {
    if (color.get(v) === WHITE) {
      parent.set(v, null);
      if (dfs(v)) return cycle;
    }
  }
  return [];
}
function applyPriorities(order, subscribers, adjacency) {
  const subMap = /* @__PURE__ */ new Map();
  for (const sub of subscribers) subMap.set(sub.id, sub);
  const depth = /* @__PURE__ */ new Map();
  for (const id of order) {
    let maxDepth = 0;
    for (const [from, toList] of adjacency) {
      if (toList.includes(id)) {
        maxDepth = Math.max(maxDepth, (depth.get(from) ?? 0) + 1);
      }
    }
    depth.set(id, maxDepth);
  }
  const layers = /* @__PURE__ */ new Map();
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d).push(id);
  }
  const result = [];
  for (let d = 0; d < layers.size; d++) {
    const layer = layers.get(d) ?? [];
    const sorted = [...layer].sort((a, b) => {
      const pa = subMap.get(a)?.priority;
      const pb = subMap.get(b)?.priority;
      const score = (p) => p === "early" ? 0 : p === "late" ? 2 : 1;
      return score(pa) - score(pb);
    });
    result.push(...sorted);
  }
  return result;
}
function visualizeGraph(subscribers) {
  const graph = /* @__PURE__ */ new Map();
  for (const sub of subscribers) {
    graph.set(sub.id, [...sub.before, ...sub.after.map((a) => `\u2190${a}`)]);
  }
  return graph;
}

// src/core/subscribe.ts
var anonCounter = 0;
var SubscriptionBuilder = class {
  _id;
  _before = [];
  _after = [];
  _priority;
  _handler;
  _event;
  constructor(event2, handler) {
    this._event = event2;
    this._handler = handler;
  }
  id(name) {
    this._id = name;
    return this;
  }
  before(...ids) {
    this._before.push(...ids);
    return this;
  }
  after(...ids) {
    this._after.push(...ids);
    return this;
  }
  priority(hint) {
    this._priority = hint;
    return this;
  }
  build() {
    const id = this._id ?? `anon_${++anonCounter}`;
    return {
      id,
      handler: this._handler,
      before: [...this._before],
      after: [...this._after],
      priority: this._priority
    };
  }
  get event() {
    return this._event;
  }
};

// src/core/system.ts
var tmpCounter = 0;
function createSystem(config) {
  let state = {};
  const fieldMap = /* @__PURE__ */ new Map();
  const eventMap = /* @__PURE__ */ new Map();
  const subscribersByEvent = /* @__PURE__ */ new Map();
  const subscriberMapByEvent = /* @__PURE__ */ new Map();
  const resolvedOrders = /* @__PURE__ */ new Map();
  const resolvedHandlers = /* @__PURE__ */ new Map();
  let tickCounter = 0;
  let systemReady = false;
  const fieldChangeListeners = /* @__PURE__ */ new Map();
  for (const f of config.fields) {
    fieldMap.set(f.name, f);
    state[f.name] = f.options.default;
  }
  for (const e of config.events) {
    eventMap.set(e.name, e);
    subscribersByEvent.set(e.name, []);
    subscriberMapByEvent.set(e.name, /* @__PURE__ */ new Map());
  }
  function rebuildSubscriberMap() {
    for (const [eventName, subs] of subscribersByEvent) {
      const map = subscriberMapByEvent.get(eventName);
      if (map) {
        map.clear();
        for (const sub of subs) map.set(sub.id, sub);
      }
    }
  }
  function rebuildResolvedHandlers() {
    resolvedHandlers.clear();
    for (const [eventName, order] of resolvedOrders) {
      const subMap = subscriberMapByEvent.get(eventName);
      if (!subMap) continue;
      const entries = [];
      for (const id of order) {
        const reg = subMap.get(id);
        if (reg) entries.push({ id, handler: reg.handler });
      }
      resolvedHandlers.set(eventName, entries);
    }
  }
  function boot() {
    if (systemReady) return;
    rebuildSubscriberMap();
    for (const [eventName, subs] of subscribersByEvent) {
      const result = resolveOrdering(subs);
      if (result.cycle && result.cycle.length > 0) {
        throw new Error(
          `Cycle detected in subscribers for event "${eventName}": ${result.cycle.join(" \u2192 ")}`
        );
      }
      resolvedOrders.set(eventName, result.order);
    }
    rebuildResolvedHandlers();
    systemReady = true;
  }
  const system = {
    get state() {
      return { ...state };
    },
    field(name) {
      return fieldMap.get(name);
    },
    event(name) {
      return eventMap.get(name);
    },
    readField(name) {
      return state[name];
    },
    writeField(name, value) {
      const oldVal = state[name];
      state = { ...state, [name]: value };
      const cbs = fieldChangeListeners.get(name);
      if (cbs) {
        for (const cb of cbs) cb(value, oldVal, name);
      }
    },
    subscribe(evt, handler) {
      return new SubscriptionBuilder(evt, handler);
    },
    fire(evt, payload) {
      boot();
      tickCounter++;
      const handlers = resolvedHandlers.get(evt.name);
      const chain = createChain({ ...state });
      if (!handlers) {
        return {
          state: chain.current,
          chain,
          tick: tickCounter,
          event: evt.name
        };
      }
      const ctx = {
        chain,
        tick: tickCounter,
        payload,
        event: evt.name
      };
      const preTickState = { ...state };
      for (const { id, handler } of handlers) {
        const result = safeExecute(handler, ctx);
        if (result.ok) {
          const delta = result.delta;
          state = { ...state, ...delta };
          chain.append(state, id);
        } else {
          chain.append(chain.unsafeCurrent, id, result.error);
        }
      }
      for (const key of fieldChangeListeners.keys()) {
        const oldVal = preTickState[key];
        const newVal = state[key];
        if (oldVal !== newVal) {
          const cbs = fieldChangeListeners.get(key);
          if (cbs) {
            for (const cb of cbs) cb(newVal, oldVal, key);
          }
        }
      }
      return {
        state: chain.current,
        chain,
        tick: tickCounter,
        event: evt.name
      };
    },
    graph() {
      return visualizeGraph(
        Array.from(subscribersByEvent.values()).flat()
      );
    },
    onFieldChange(name, cb) {
      if (!fieldChangeListeners.has(name)) {
        fieldChangeListeners.set(name, /* @__PURE__ */ new Set());
      }
      fieldChangeListeners.get(name).add(cb);
      return () => {
        fieldChangeListeners.get(name)?.delete(cb);
      };
    },
    get tick() {
      return tickCounter;
    }
  };
  const origSubscribe = system.subscribe.bind(system);
  system.subscribe = function subscribeProxy(evt, handler) {
    const builder = origSubscribe(evt, handler);
    const subs = subscribersByEvent.get(evt.name);
    const subMap = subscriberMapByEvent.get(evt.name);
    if (!subs || !subMap) return builder;
    const tempId = `_tmp_${++tmpCounter}`;
    let currentReg = {
      id: tempId,
      handler,
      before: [],
      after: []
    };
    const regList = subs;
    regList.push(currentReg);
    subMap.set(tempId, currentReg);
    function reRegister() {
      const reg = builder.build();
      if (reg.id !== tempId) {
        for (const existing of regList) {
          if (existing.id === reg.id && existing.id !== tempId && existing.id !== currentReg.id) {
            throw new Error(
              `Duplicate subscriber id "${reg.id}" for event "${evt.name}"`
            );
          }
        }
      }
      const sameOrdering = arraysEqual(reg.before, currentReg.before) && arraysEqual(reg.after, currentReg.after) && reg.priority === currentReg.priority;
      const prevId = currentReg.id;
      currentReg = reg;
      let targetIdx = regList.findIndex((s) => s.id === tempId);
      if (targetIdx < 0) {
        targetIdx = regList.findIndex((s) => s.id === prevId);
      }
      if (targetIdx >= 0) {
        regList[targetIdx] = reg;
      }
      subMap.set(reg.id, reg);
      if (reg.id !== tempId) subMap.delete(tempId);
      if (prevId !== reg.id) subMap.delete(prevId);
      if (sameOrdering) {
        if (systemReady && resolvedOrders.has(evt.name)) {
          const order = resolvedOrders.get(evt.name);
          if (order.includes(reg.id)) {
            const entries = [];
            for (const id of order) {
              const r = subMap.get(id);
              if (r) entries.push({ id, handler: r.handler });
            }
            resolvedHandlers.set(evt.name, entries);
            return;
          }
        } else {
          return;
        }
      }
      const result = resolveOrdering(regList);
      if (result.cycle && result.cycle.length > 0) {
        throw new Error(
          `Cycle detected after adding subscriber "${reg.id}" to event "${evt.name}": ${result.cycle.join(" \u2192 ")}`
        );
      }
      resolvedOrders.set(evt.name, result.order);
      if (subMap) {
        const entries = [];
        for (const id of result.order) {
          const reg2 = subMap.get(id);
          if (reg2) entries.push({ id, handler: reg2.handler });
        }
        resolvedHandlers.set(evt.name, entries);
      }
    }
    function arraysEqual(a, b) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    const origId = builder.id.bind(builder);
    builder.id = function(name) {
      origId(name);
      reRegister();
      return this;
    };
    const origBefore = builder.before.bind(builder);
    builder.before = function(...ids) {
      origBefore(...ids);
      reRegister();
      return this;
    };
    const origAfter = builder.after.bind(builder);
    builder.after = function(...ids) {
      origAfter(...ids);
      reRegister();
      return this;
    };
    const origPriority = builder.priority.bind(builder);
    builder.priority = function(hint) {
      origPriority(hint);
      reRegister();
      return this;
    };
    return builder;
  };
  return system;
}
var activeSystem = null;
function useSystem(sys) {
  activeSystem = sys;
}
function getSystem() {
  return activeSystem;
}
function safeExecute(handler, ctx) {
  try {
    const result = handler(ctx);
    if (result.ok) {
      return { ok: true, delta: result.value };
    }
    return { ok: false, error: result.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { message } };
  }
}

// src/core/field.ts
function field(name, options) {
  return { name, options };
}

// src/core/event.ts
function event(name) {
  return { name };
}

// src/view/bindings.ts
var modelDebounceMs = 200;
function setModelDebounce(ms) {
  modelDebounceMs = ms;
}
function parseBindAttr(name) {
  const match = name.match(/^mf-bind:(.+)$/);
  if (!match) return null;
  return { type: "bind", attr: match[1] };
}
function parseOnAttr(name) {
  const match = name.match(/^mf-on:(.+)$/);
  if (!match) return null;
  return { type: "on", event: match[1] };
}
function parseBinding(el) {
  for (const attr of el.getAttributeNames()) {
    if (attr === "mf-text") {
      return { type: "text", field: el.getAttribute(attr) };
    }
    if (attr === "mf-toggle") {
      return { type: "toggle", field: el.getAttribute(attr) };
    }
    if (attr === "mf-model") {
      return { type: "model", field: el.getAttribute(attr) };
    }
    const bind = parseBindAttr(attr);
    if (bind) {
      const raw = el.getAttribute(attr);
      const pipeIdx = raw.indexOf("|");
      if (pipeIdx === -1) {
        return {
          type: "bind",
          attr: bind.attr,
          fields: [raw.trim()],
          template: "{0}"
        };
      }
      const template = raw.slice(0, pipeIdx).trim();
      const fields = raw.slice(pipeIdx + 1).split(",").map((s) => s.trim());
      return { type: "bind", attr: bind.attr, fields, template };
    }
    const on = parseOnAttr(attr);
    if (on) {
      const raw = el.getAttribute(attr);
      const colonIdx = raw.indexOf(":");
      if (colonIdx === -1) {
        return {
          type: "on",
          event: on.event,
          targetEvent: raw.trim(),
          args: []
        };
      }
      return {
        type: "on",
        event: on.event,
        targetEvent: raw.slice(0, colonIdx).trim(),
        args: raw.slice(colonIdx + 1).split(",").map((s) => s.trim())
      };
    }
  }
  return null;
}
function bindComponent(host, root) {
  const system = getSystem();
  if (!system) return;
  const unbindFns = [];
  const elements = root.querySelectorAll("*");
  for (const el of elements) {
    const binding = parseBinding(el);
    if (!binding) continue;
    switch (binding.type) {
      case "text": {
        el.textContent = String(system.readField(binding.field) ?? "");
        const unsub = system.onFieldChange(binding.field, (val) => {
          el.textContent = String(val ?? "");
        });
        unbindFns.push(unsub);
        break;
      }
      case "bind": {
        const vals = new Array(binding.fields.length).fill(void 0);
        binding.fields.forEach((fieldName, i) => {
          vals[i] = system.readField(fieldName);
        });
        applyBindTemplate(el, binding, vals);
        binding.fields.forEach((fieldName, i) => {
          const unsub = system.onFieldChange(fieldName, (val) => {
            vals[i] = val;
            applyBindTemplate(el, binding, vals);
          });
          unbindFns.push(unsub);
        });
        break;
      }
      case "toggle": {
        const htEl = el;
        htEl.hidden = !Boolean(system.readField(binding.field));
        const unsub = system.onFieldChange(binding.field, (val) => {
          htEl.hidden = !Boolean(val);
        });
        unbindFns.push(unsub);
        break;
      }
      case "on": {
        const evtObj = system.event(binding.targetEvent);
        if (!evtObj) {
          console.warn(`mf-on: unknown event "${binding.targetEvent}" on element`, el);
          break;
        }
        const payload = binding.args.length === 0 ? void 0 : binding.args.length === 1 ? tryParseNumber(binding.args[0]) : binding.args.map((a) => tryParseNumber(a));
        const handler = () => {
          system.fire(evtObj, payload);
        };
        el.addEventListener(binding.event, handler);
        unbindFns.push(() => el.removeEventListener(binding.event, handler));
        break;
      }
      case "model": {
        const inputEl = el;
        inputEl.value = String(system.readField(binding.field) ?? "");
        const unsub = system.onFieldChange(binding.field, (val) => {
          inputEl.value = String(val ?? "");
        });
        unbindFns.push(unsub);
        let timer;
        const flush = () => {
          if (timer !== void 0) {
            clearTimeout(timer);
            timer = void 0;
          }
          system.writeField(binding.field, tryParseNumber(inputEl.value));
        };
        const onInput = () => {
          if (timer !== void 0) clearTimeout(timer);
          timer = setTimeout(flush, modelDebounceMs);
        };
        const onBlur = () => {
          if (timer !== void 0) {
            clearTimeout(timer);
            timer = void 0;
          }
          system.writeField(binding.field, tryParseNumber(inputEl.value));
        };
        inputEl.addEventListener("input", onInput);
        inputEl.addEventListener("blur", onBlur);
        unbindFns.push(() => {
          inputEl.removeEventListener("input", onInput);
          inputEl.removeEventListener("blur", onBlur);
          if (timer !== void 0) clearTimeout(timer);
        });
        break;
      }
    }
  }
  host.__mf_unbind = unbindFns;
}
function tryParseNumber(s) {
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== "") return n;
  return s;
}
function applyBindTemplate(el, binding, vals) {
  const rendered = binding.template.replace(
    /\{(\d+)\}/g,
    (_, idx) => String(vals[Number(idx)] ?? "")
  );
  if (binding.attr === "style") {
    el.style.cssText = rendered;
  } else {
    el.setAttribute(binding.attr, rendered);
  }
}

// src/view/flow.ts
function flow(name, template) {
  if (customElements.get(name)) return;
  const templateContent = template.content;
  class MechComponent extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot.appendChild(templateContent.cloneNode(true));
    }
    connectedCallback() {
      bindComponent(this, this.shadowRoot);
    }
    disconnectedCallback() {
      const fns = this.__mf_unbind;
      if (fns) {
        for (const fn of fns) fn();
        delete this.__mf_unbind;
      }
    }
  }
  customElements.define(name, MechComponent);
}

// src/core/types.ts
function Ok(value) {
  return { ok: true, value };
}
function Err(error) {
  return { ok: false, error };
}

// src/mod.ts
function subscribe(evt, handler) {
  const sys = getSystem();
  if (!sys) throw new Error("No active system. Call useSystem() first.");
  return sys.subscribe(evt, handler);
}
export {
  Err,
  Ok,
  createSystem,
  event,
  field,
  flow,
  getSystem,
  setModelDebounce,
  subscribe,
  useSystem
};
