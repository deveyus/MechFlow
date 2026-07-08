// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Field, FieldOptions } from "./types.ts";

export function field<T, N extends string>(
  name: N,
  options: FieldOptions<T>,
): Field<T, N> {
  return { name, options } as Field<T, N>;
}
