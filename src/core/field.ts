// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

import type { Field, FieldOptions } from "./types.ts";

export function field<T, N extends string>(
  name: N,
  options: FieldOptions<T>,
): Field<T, N> {
  return { name, options } as Field<T, N>;
}
