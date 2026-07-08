// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Chain, ChainLink } from "./types.ts";
import type { SubscriberError } from "./types.ts";

export function createChain<S>(initial: S): InternalChain<S> {
  const links: ChainLink<S>[] = [
    { state: initial, subscriberId: "__init__" },
  ];

  function lastSuccessIndex(): number {
    for (let i = links.length - 1; i >= 0; i--) {
      if (!links[i].error) return i;
    }
    return 0;
  }

  const chain: InternalChain<S> = {
    get first(): S {
      return links[0].state;
    },
    get current(): S {
      return links[lastSuccessIndex()].state;
    },
    get unsafeCurrent(): S {
      return links[links.length - 1].state;
    },
    get links(): readonly ChainLink<S>[] {
      return links;
    },
    at(index: number): ChainLink<S> | undefined {
      if (index < 0) index = links.length + index;
      return links[index];
    },
    find(id: string): ChainLink<S> | undefined {
      return links.find((l) => l.subscriberId === id);
    },
    [Symbol.iterator](): Iterator<ChainLink<S>> {
      return links[Symbol.iterator]();
    },
    append(
      state: S,
      subscriberId: string,
      error?: SubscriberError,
    ): void {
      links.push({ state, subscriberId, error });
    },
  };

  return chain;
}

export interface InternalChain<S> extends Chain<S> {
  append(state: S, subscriberId: string, error?: SubscriberError): void;
}
