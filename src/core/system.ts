// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

let tmpCounter = 0;

import type {
  Field,
  Event,
  SubscriberRegistration,
  SubscriberHandler,
  StateShape,
  PriorityHint,
  SubscriberError,
  FieldChangeCallback,
  Chain,
} from "./types.ts";
import { createChain } from "./chain.ts";
import { resolveOrdering, visualizeGraph } from "./ordering.ts";
import { SubscriptionBuilder } from "./subscribe.ts";
import { field } from "./field.ts";

export type SystemConfig<F extends Field<any, string>[]> = {
  fields: F;
  events: Event<any>[];
};

export type TickResult<S> = {
  state: S;
  chain: Chain<S>;
  tick: number;
  event: string;
};

export type System<S> = {
  readonly state: S;
  field(name: string): Field<any> | undefined;
  event(name: string): Event<any> | undefined;
  readField(name: string): unknown;
  subscribe<E>(
    evt: Event<E>,
    handler: SubscriberHandler<E, S>,
  ): SubscriptionBuilder<S>;
  fire<E>(evt: Event<E>, payload: E): TickResult<S>;
  graph(): Map<string, string[]>;
  onFieldChange(name: string, cb: FieldChangeCallback): () => void;
  tick: number;
};

export function createSystem<F extends Field<any, string>[]>(
  config: SystemConfig<F>,
): System<StateShape<F>> {
  type S = StateShape<F>;

  type HandlerEntry = { id: string; handler: SubscriberHandler<any, S> };

  let state = {} as S;
  const fieldMap = new Map<string, Field<any>>();
  const eventMap = new Map<string, Event<any>>();
  const subscribersByEvent = new Map<string, SubscriberRegistration<S>[]>();
  const subscriberMapByEvent = new Map<string, Map<string, SubscriberRegistration<S>>>();
  const resolvedOrders = new Map<string, string[]>();
  const resolvedHandlers = new Map<string, HandlerEntry[]>();
  let tickCounter = 0;
  let systemReady = false;
  const fieldChangeListeners = new Map<string, Set<FieldChangeCallback>>();

  for (const f of config.fields) {
    fieldMap.set(f.name, f);
    (state as Record<string, unknown>)[f.name] = f.options.default;
  }

  for (const e of config.events) {
    eventMap.set(e.name, e);
    subscribersByEvent.set(e.name, []);
    subscriberMapByEvent.set(e.name, new Map());
  }

  function rebuildSubscriberMap(): void {
    for (const [eventName, subs] of subscribersByEvent) {
      const map = subscriberMapByEvent.get(eventName);
      if (map) {
        map.clear();
        for (const sub of subs) map.set(sub.id, sub);
      }
    }
  }

  function rebuildResolvedHandlers(): void {
    resolvedHandlers.clear();
    for (const [eventName, order] of resolvedOrders) {
      const subMap = subscriberMapByEvent.get(eventName);
      if (!subMap) continue;
      const entries: HandlerEntry[] = [];
      for (const id of order) {
        const reg = subMap.get(id);
        if (reg) entries.push({ id, handler: reg.handler });
      }
      resolvedHandlers.set(eventName, entries);
    }
  }

  function boot(): void {
    if (systemReady) return;
    rebuildSubscriberMap();
    for (const [eventName, subs] of subscribersByEvent) {
      const result = resolveOrdering(subs);
      if (result.cycle && result.cycle.length > 0) {
        throw new Error(
          `Cycle detected in subscribers for event "${eventName}": ${
            result.cycle.join(" → ")
          }`,
        );
      }
      resolvedOrders.set(eventName, result.order);
    }
    rebuildResolvedHandlers();
    systemReady = true;
  }

  const system: System<S> = {
    get state(): S {
      return { ...state } as S;
    },

    field(name: string): Field<any> | undefined {
      return fieldMap.get(name);
    },

    event(name: string): Event<any> | undefined {
      return eventMap.get(name);
    },

    readField(name: string): unknown {
      return (state as Record<string, unknown>)[name];
    },

    subscribe<E>(
      evt: Event<E>,
      handler: SubscriberHandler<E, S>,
    ): SubscriptionBuilder<S> {
      return new SubscriptionBuilder(evt, handler as SubscriberHandler<any, S>);
    },

    fire<E>(evt: Event<E>, payload: E): TickResult<S> {
      boot();
      tickCounter++;

      const handlers = resolvedHandlers.get(evt.name);
      const chain = createChain({ ...state } as S);
      if (!handlers) {
        return {
          state: chain.current as S,
          chain: chain as Chain<S>,
          tick: tickCounter,
          event: evt.name,
        };
      }

      const ctx = {
        chain: chain as Chain<S>,
        tick: tickCounter,
        payload,
        event: evt.name,
      } as const;

      const preTickState = { ...state } as Record<string, unknown>;

      for (const { id, handler } of handlers) {
        const result = safeExecute(handler, ctx);

        if (result.ok) {
          const delta = result.delta;
          state = { ...state, ...delta };
          chain.append(state as S, id);
        } else {
          chain.append(chain.unsafeCurrent as S, id, result.error);
        }
      }

      for (const key of fieldChangeListeners.keys()) {
        const oldVal = preTickState[key];
        const newVal = (state as Record<string, unknown>)[key];
        if (oldVal !== newVal) {
          const cbs = fieldChangeListeners.get(key);
          if (cbs) {
            for (const cb of cbs) cb(newVal, oldVal, key);
          }
        }
      }

      return {
        state: chain.current as S,
        chain: chain as Chain<S>,
        tick: tickCounter,
        event: evt.name,
      };
    },

    graph(): Map<string, string[]> {
      return visualizeGraph(
        Array.from(subscribersByEvent.values()).flat(),
      );
    },

    onFieldChange(name: string, cb: FieldChangeCallback): () => void {
      if (!fieldChangeListeners.has(name)) {
        fieldChangeListeners.set(name, new Set());
      }
      fieldChangeListeners.get(name)!.add(cb);
      return () => {
        fieldChangeListeners.get(name)?.delete(cb);
      };
    },

    get tick(): number {
      return tickCounter;
    },
  };

  // Patch subscribe to auto-register immediately and update on chaining
  const origSubscribe = system.subscribe.bind(system);
  system.subscribe = function subscribeProxy<E>(
    evt: Event<E>,
    handler: SubscriberHandler<E, S>,
  ): SubscriptionBuilder<S> {
    const builder = origSubscribe(evt, handler);
    const subs = subscribersByEvent.get(evt.name);
    const subMap = subscriberMapByEvent.get(evt.name);
    if (!subs || !subMap) return builder;

    // Register immediately with a temp ID
    const tempId = `_tmp_${++tmpCounter}`;
    let currentReg: SubscriberRegistration<S> = {
      id: tempId, handler: handler as SubscriberHandler<any, S>,
      before: [], after: [],
    };
    const regList = subs!;
    regList.push(currentReg);
    subMap.set(tempId, currentReg);

    function reRegister(): void {
      const reg = builder.build();

      if (reg.id !== tempId) {
        for (const existing of regList) {
          if (
            existing.id === reg.id &&
            existing.id !== tempId &&
            existing.id !== currentReg.id
          ) {
            throw new Error(
              `Duplicate subscriber id "${reg.id}" for event "${evt.name}"`,
            );
          }
        }
      }

      const sameOrdering =
        arraysEqual(reg.before, currentReg.before) &&
        arraysEqual(reg.after, currentReg.after) &&
        reg.priority === currentReg.priority;

      const prevId = currentReg.id;
      currentReg = reg;
      let targetIdx = regList.findIndex((s) => s.id === tempId);
      if (targetIdx < 0) {
        targetIdx = regList.findIndex((s) => s.id === prevId);
      }
      if (targetIdx >= 0) {
        regList[targetIdx] = reg;
      }
      subMap!.set(reg.id, reg);
      if (reg.id !== tempId) subMap!.delete(tempId);
      if (prevId !== reg.id) subMap!.delete(prevId);

      if (sameOrdering) {
        if (systemReady && resolvedOrders.has(evt.name)) {
          const order = resolvedOrders.get(evt.name)!;
          if (order.includes(reg.id)) {
            const entries: HandlerEntry[] = [];
            for (const id of order) {
              const r = subMap!.get(id);
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
          `Cycle detected after adding subscriber "${reg.id}" to event "${evt.name}": ${result.cycle.join(" → ")}`,
        );
      }
      resolvedOrders.set(evt.name, result.order);
      if (subMap) {
        const entries: HandlerEntry[] = [];
        for (const id of result.order) {
          const reg = subMap.get(id);
          if (reg) entries.push({ id, handler: reg.handler });
        }
        resolvedHandlers.set(evt.name, entries);
      }
    }

    function arraysEqual(a: string[], b: string[]): boolean {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }

    const origId = builder.id.bind(builder);
    builder.id = function (name: string): SubscriptionBuilder<S> {
      origId(name);
      reRegister();
      return this;
    };

    const origBefore = builder.before.bind(builder);
    builder.before = function (...ids: string[]): SubscriptionBuilder<S> {
      origBefore(...ids);
      reRegister();
      return this;
    };

    const origAfter = builder.after.bind(builder);
    builder.after = function (...ids: string[]): SubscriptionBuilder<S> {
      origAfter(...ids);
      reRegister();
      return this;
    };

    const origPriority = builder.priority.bind(builder);
    builder.priority = function (hint: PriorityHint): SubscriptionBuilder<S> {
      origPriority(hint);
      reRegister();
      return this;
    };

    return builder;
  };

  return system;
}

let activeSystem: System<any> | null = null;

export function useSystem<S>(sys: System<S>): void {
  activeSystem = sys;
}

export function getSystem<S>(): System<S> | null {
  return activeSystem as System<S> | null;
}

type ExecuteResult =
  | { ok: true; delta: Record<string, unknown> }
  | { ok: false; error: SubscriberError };

function safeExecute(
  handler: SubscriberHandler<any, any>,
  ctx: any,
): ExecuteResult {
  try {
    const result = handler(ctx);
    if (result.ok) {
      return { ok: true, delta: result.value as Record<string, unknown> };
    }
    return { ok: false, error: result.error };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { message } };
  }
}
