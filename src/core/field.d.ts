import type { Field, FieldOptions } from "./types.ts";
export declare function field<T, N extends string>(name: N, options: FieldOptions<T>): Field<T, N>;
