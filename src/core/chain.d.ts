import type { Chain } from "./types.ts";
import type { SubscriberError } from "./types.ts";
export declare function createChain<S>(initial: S): InternalChain<S>;
export interface InternalChain<S> extends Chain<S> {
    append(state: S, subscriberId: string, error?: SubscriberError): void;
}
