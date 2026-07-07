import type { Field, Event, SubscriberRegistration, SubscriberHandler } from "./core/types.ts";
import type { Chain, ChainLink, SubscriberContext, SubscriberError, PriorityHint, Delta } from "./core/types.ts";
import type { SystemConfig, System, TickResult } from "./core/system.ts";
import type { SubscriptionBuilder } from "./core/subscribe.ts";
import type { StateShape } from "./core/types.ts";

export { field } from "./core/field.ts";
export { event } from "./core/event.ts";
export { createSystem, useSystem, getSystem } from "./core/system.ts";
export { flow } from "./view/flow.ts";
export { Ok, Err } from "ts-results-es";
export type { Result } from "ts-results-es";

export type {
  Field,
  Event,
  Chain,
  ChainLink,
  SubscriberContext,
  SubscriberError,
  PriorityHint,
  Delta,
  SubscriptionBuilder,
  SubscriberRegistration,
  SubscriberHandler,
  SystemConfig,
  System,
  TickResult,
  StateShape,
};
