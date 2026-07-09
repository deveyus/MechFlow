// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

import type { Event, SubscriberHandler, SubscriberRegistration, PriorityHint } from "./types.ts";

let anonCounter = 0;

export class SubscriptionBuilder<S> {
  private _id?: string;
  private _before: string[] = [];
  private _after: string[] = [];
  private _priority?: PriorityHint;
  private _handler: SubscriberHandler<any, S>;
  private _event: Event<any>;

  constructor(event: Event<any>, handler: SubscriberHandler<any, S>) {
    this._event = event;
    this._handler = handler;
  }

  id(name: string): this {
    this._id = name;
    return this;
  }

  before(...ids: string[]): this {
    this._before.push(...ids);
    return this;
  }

  after(...ids: string[]): this {
    this._after.push(...ids);
    return this;
  }

  priority(hint: PriorityHint): this {
    this._priority = hint;
    return this;
  }

  build(): SubscriberRegistration<S> {
    const id = this._id ?? `anon_${++anonCounter}`;
    return {
      id,
      handler: this._handler,
      before: [...this._before],
      after: [...this._after],
      priority: this._priority,
    };
  }

  get event(): Event<any> {
    return this._event;
  }
}
