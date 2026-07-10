import type { SubscriberRegistration } from "./types.ts";
export type Graph = Map<string, string[]>;
export type OrderingResult = {
    order: string[];
    cycle?: string[];
};
export declare function resolveOrdering(subscribers: SubscriberRegistration<any>[]): OrderingResult;
export declare function visualizeGraph(subscribers: SubscriberRegistration<any>[]): Graph;
