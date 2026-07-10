import type { Event } from "./types.ts";
export declare function event<E = void, N extends string = string>(name: N): Event<E, N>;
