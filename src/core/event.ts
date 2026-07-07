import type { Event } from "./types.ts";

export function event<E, N extends string = string>(
  name: N,
): Event<E, N> {
  return { name } as Event<E, N>;
}
