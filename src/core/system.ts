import type {
  Field,
  Event,
  SubscriberRegistration,
  SubscriberHandler,
  StateShape,
  PriorityHint,
  SubscriberError,
} from "./types.ts";
import type { Chain } from "./types.ts";
import { Ok, Err, type Result } from "ts-results-es";
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
  field(name: string): Field<any> | undefined;
  event(name: string): Event<any> | undefined;
  subscribe<E>(
    evt: Event<E>,
    handler: SubscriberHandler<E, S>,
  ): SubscriptionBuilder<S>;
  fire<E>(evt: Event<E>, payload: E): TickResult<S>;
  graph(): Map<string, string[]>;
  tick: number;
};

export function createSystem<F extends Field<any, string>[]>(
  config: SystemConfig<F>,
): System<StateShape<F>> {
  type S = StateShape<F>;

  let state = {} as S;
  const fieldMap = new Map<string, Field<any>>();
  const eventMap = new Map<string, Event<any>>();
  const subscribersByEvent = new Map<string, SubscriberRegistration<S>[]>();
  const resolvedOrders = new Map<string, string[]>();
  let tickCounter = 0;
  let systemReady = false;

  for (const f of config.fields) {
    fieldMap.set(f.name, f);
    (state as Record<string, unknown>)[f.name] = f.options.default;
  }

  for (const e of config.events) {
    eventMap.set(e.name, e);
    subscribersByEvent.set(e.name, []);
  }

  function boot(): void {
    if (systemReady) return;
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
    systemReady = true;
  }

  const system: System<S> = {
    field(name: string): Field<any> | undefined {
      return fieldMap.get(name);
    },

    event(name: string): Event<any> | undefined {
      return eventMap.get(name);
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

      const chain = createChain({ ...state } as S);
      const subs = subscribersByEvent.get(evt.name) ?? [];
      const order = resolvedOrders.get(evt.name) ?? [];

      for (const subscriberId of order) {
        const reg = subs.find((s) => s.id === subscriberId);
        if (!reg) continue;

        const ctx = {
          chain: chain as Chain<S>,
          tick: tickCounter,
          payload,
          event: evt.name,
        } as const;

        const result = safeExecute(reg.handler, ctx);

        if (result.isOk()) {
          const delta = result.unwrap();
          state = { ...state, ...delta };
          chain.append(state as S, subscriberId);
        } else {
          chain.append(chain.unsafeCurrent as S, subscriberId, result.unwrapErr());
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
    if (!subs) return builder;

    // Register immediately with a temp ID
    const tempId = `_tmp_${Math.random().toString(36).slice(2, 8)}`;
    let currentReg: SubscriberRegistration<S> = {
      id: tempId, handler: handler as SubscriberHandler<any, S>,
      before: [], after: [],
    };
    const regList = subs!;
    regList.push(currentReg);

    function reRegister(): void {
      const reg = builder.build();
      currentReg = reg;
      const oldIdx = regList.findIndex((s) =>
        s.id === tempId || s.id === reg.id
      );
      if (oldIdx >= 0) regList[oldIdx] = reg;
      // Re-resolve ordering
      const result = resolveOrdering(regList);
      if (result.cycle && result.cycle.length > 0) {
        throw new Error(
          `Cycle detected after adding subscriber "${reg.id}" to event "${evt.name}": ${result.cycle.join(" → ")}`,
        );
      }
      resolvedOrders.set(evt.name, result.order);
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

function safeExecute<S>(
  handler: SubscriberHandler<any, S>,
  ctx: any,
): Result<Record<string, unknown>, SubscriberError> {
  try {
    const result = handler(ctx);
    if (result.isOk()) {
      return Ok(result.unwrap() as Record<string, unknown>);
    }
    return Err(result.unwrapErr());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Err({ message });
  }
}
