import type { Field, Event, SubscriberHandler, StateShape, FieldChangeCallback, Chain } from "./types.ts";
import { SubscriptionBuilder } from "./subscribe.ts";
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
    writeField(name: string, value: unknown): void;
    subscribe<E>(evt: Event<E>, handler: SubscriberHandler<E, S>): SubscriptionBuilder<S>;
    fire<E>(evt: Event<E>, payload: E): TickResult<S>;
    graph(): Map<string, string[]>;
    onFieldChange(name: string, cb: FieldChangeCallback): () => void;
    tick: number;
};
export declare function createSystem<F extends Field<any, string>[]>(config: SystemConfig<F>): System<StateShape<F>>;
export declare function useSystem<S>(sys: System<S>): void;
export declare function getSystem<S>(): System<S> | null;
