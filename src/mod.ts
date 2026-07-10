// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

import type {
  Event,
  Field,
  FieldChangeCallback,
  SubscriberHandler,
  SubscriberRegistration,
} from "./core/types.ts";
import type {
  Chain,
  ChainLink,
  Delta,
  PriorityHint,
  SubscriberContext,
  SubscriberError,
} from "./core/types.ts";
import type { System, SystemConfig, TickResult } from "./core/system.ts";
import type { SubscriptionBuilder } from "./core/subscribe.ts";
import type { StateShape } from "./core/types.ts";
import { getSystem } from "./core/system.ts";

export { field } from "./core/field.ts";
export { event } from "./core/event.ts";
export { createSystem, getSystem, useSystem } from "./core/system.ts";
export { flow } from "./view/flow.ts";
export { setModelDebounce } from "./view/bindings.ts";
export { Err, Ok } from "./core/types.ts";
export type { ErrResult, OkResult, Result } from "./core/types.ts";

export function subscribe<E>(
  evt: Event<E>,
  handler: SubscriberHandler<E, any>,
): SubscriptionBuilder<any> {
  const sys = getSystem();
  if (!sys) throw new Error("No active system. Call useSystem() first.");
  return sys.subscribe(evt, handler);
}

export type {
  Chain,
  ChainLink,
  Delta,
  Event,
  Field,
  FieldChangeCallback,
  PriorityHint,
  StateShape,
  SubscriberContext,
  SubscriberError,
  SubscriberHandler,
  SubscriberRegistration,
  SubscriptionBuilder,
  System,
  SystemConfig,
  TickResult,
};
