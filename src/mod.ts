// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: LGPL-3.0-or-later

import type { Field, Event, SubscriberRegistration, SubscriberHandler, FieldChangeCallback } from "./core/types.ts";
import type { Chain, ChainLink, SubscriberContext, SubscriberError, PriorityHint, Delta } from "./core/types.ts";
import type { SystemConfig, System, TickResult } from "./core/system.ts";
import type { SubscriptionBuilder } from "./core/subscribe.ts";
import type { StateShape } from "./core/types.ts";
import { getSystem } from "./core/system.ts";

export { field } from "./core/field.ts";
export { event } from "./core/event.ts";
export { createSystem, useSystem, getSystem } from "./core/system.ts";
export { flow } from "./view/flow.ts";
export { Ok, Err } from "./core/types.ts";
export type { Result, OkResult, ErrResult } from "./core/types.ts";

export function subscribe<E>(
  evt: Event<E>,
  handler: SubscriberHandler<E, any>,
): SubscriptionBuilder<any> {
  const sys = getSystem();
  if (!sys) throw new Error("No active system. Call useSystem() first.");
  return sys.subscribe(evt, handler);
}

export type {
  Field,
  Event,
  Chain,
  ChainLink,
  SubscriberContext,
  SubscriberError,
  PriorityHint,
  Delta,
  FieldChangeCallback,
  SubscriptionBuilder,
  SubscriberRegistration,
  SubscriberHandler,
  SystemConfig,
  System,
  TickResult,
  StateShape,
};
