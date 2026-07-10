import type { Event, SubscriberHandler, SubscriberRegistration, PriorityHint } from "./types.ts";
export declare class SubscriptionBuilder<S> {
    private _id?;
    private _before;
    private _after;
    private _priority?;
    private _handler;
    private _event;
    constructor(event: Event<any>, handler: SubscriberHandler<any, S>);
    id(name: string): this;
    before(...ids: string[]): this;
    after(...ids: string[]): this;
    priority(hint: PriorityHint): this;
    build(): SubscriberRegistration<S>;
    get event(): Event<any>;
}
