type ParsedBinding = {
    type: "text";
    field: string;
} | {
    type: "bind";
    attr: string;
    fields: string[];
    template: string;
} | {
    type: "toggle";
    field: string;
} | {
    type: "on";
    event: string;
    targetEvent: string;
    args: string[];
} | {
    type: "model";
    field: string;
};
export declare function setModelDebounce(ms: number): void;
export declare function parseBinding(el: Element): ParsedBinding | null;
export declare function bindComponent(host: HTMLElement, root: ShadowRoot): void;
export declare function tryParseNumber(s: string): string | number;
export {};
