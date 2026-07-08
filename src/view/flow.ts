// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: LGPL-3.0-or-later

/// <reference lib="dom" />

import { bindComponent } from "./bindings.ts";

export function flow(name: string, template: HTMLTemplateElement): void {
  if (customElements.get(name)) return;

  const templateContent = template.content;

  class MechComponent extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot!.appendChild(templateContent.cloneNode(true));
    }

    connectedCallback() {
      bindComponent(this, this.shadowRoot!);
    }

    disconnectedCallback() {
      const fns = (this as any).__mf_unbind as (() => void)[] | undefined;
      if (fns) {
        for (const fn of fns) fn();
        delete (this as any).__mf_unbind;
      }
    }
  }

  customElements.define(name, MechComponent);
}
