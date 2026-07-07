/// <reference lib="dom" />

import { bindComponent } from "./bindings.ts";

export function flow(name: string, template: HTMLTemplateElement): void {
  if (customElements.get(name)) return;

  const templateContent = template.content;

  class MechComponent extends HTMLElement {
    #boundElements: Map<string, Set<{ el: Element; attr: string; transform?: string }>> = new Map();
    #disconnectFns: (() => void)[] = [];

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot!.appendChild(templateContent.cloneNode(true));
    }

    connectedCallback() {
      bindComponent(this, this.shadowRoot!);
    }

    disconnectedCallback() {
      for (const fn of this.#disconnectFns) fn();
      this.#disconnectFns = [];
      this.#boundElements.clear();
    }
  }

  customElements.define(name, MechComponent);
}
