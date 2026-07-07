import { Result } from "ts-results-es";

export type { Result } from "ts-results-es";
export { Ok, Err } from "ts-results-es";

export type SubscriberError = {
  readonly message: string;
  readonly meta?: Record<string, unknown>;
};

export type FieldOptions<T> = {
  default: T;
};

export type Brand<T, B extends string> = T & { __brand: B };

export type Field<T, N extends string = string> = Brand<{
  name: N;
  options: FieldOptions<T>;
}, `field:${N}`>;

export type Event<E, N extends string = string> = Brand<{
  name: N;
}, `event:${N}`>;

export type Delta<T> = Partial<T>;

export type StateShape<F extends Field<any, string>[]> = {
  [K in F[number]as K["name"]]: K extends Field<infer V, string> ? V : never;
};

export type ChainLink<S> = {
  state: S;
  subscriberId: string;
  error?: SubscriberError;
};

export type Chain<S> = Readonly<{
  first: S;
  current: S;
  unsafeCurrent: S;
  readonly links: readonly ChainLink<S>[];
  at(index: number): ChainLink<S> | undefined;
  find(id: string): ChainLink<S> | undefined;
  [Symbol.iterator](): Iterator<ChainLink<S>>;
}>;

export type SubscriberContext<E, S> = Readonly<{
  chain: Chain<S>;
  tick: number;
  payload: E;
  event: string;
}>;

export type SubscriberHandler<E, S> = (ctx: SubscriberContext<E, S>) => Result<Delta<S>, SubscriberError>;

export type PriorityHint = "early" | "late";

export type SubscriberRegistration<S> = {
  id: string;
  handler: SubscriberHandler<any, S>;
  before: string[];
  after: string[];
  priority?: PriorityHint;
};
