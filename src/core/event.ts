// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

import type { Event } from "./types.ts";

export function event<E = void, N extends string = string>(
  name: N,
): Event<E, N> {
  return { name } as Event<E, N>;
}
