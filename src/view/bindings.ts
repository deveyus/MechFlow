// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: LGPL-3.0-or-later

/// <reference lib="dom" />

import { getSystem } from "../core/system.ts";

type ParsedBinding =
  | { type: "text"; field: string }
  | { type: "bind"; attr: string; fields: string[]; template: string }
  | { type: "toggle"; field: string }
  | { type: "on"; event: string; targetEvent: string; args: string[] };

function parseBindAttr(name: string): { type: "bind"; attr: string } | null {
  const match = name.match(/^mf-bind:(.+)$/);
  if (!match) return null;
  return { type: "bind", attr: match[1] };
}

function parseOnAttr(name: string): { type: "on"; event: string } | null {
  const match = name.match(/^mf-on:(.+)$/);
  if (!match) return null;
  return { type: "on", event: match[1] };
}

function parseBinding(el: Element): ParsedBinding | null {
  for (const attr of el.getAttributeNames()) {
    if (attr === "mf-text") {
      return { type: "text", field: el.getAttribute(attr)! };
    }
    if (attr === "mf-toggle") {
      return { type: "toggle", field: el.getAttribute(attr)! };
    }
    const bind = parseBindAttr(attr);
    if (bind) {
      const raw = el.getAttribute(attr)!;
      const pipeIdx = raw.indexOf("|");
      if (pipeIdx === -1) {
        return {
          type: "bind",
          attr: bind.attr,
          fields: [raw.trim()],
          template: "{0}",
        };
      }
      const template = raw.slice(0, pipeIdx).trim();
      const fields = raw.slice(pipeIdx + 1).split(",").map((s) => s.trim());
      return { type: "bind", attr: bind.attr, fields, template };
    }
    const on = parseOnAttr(attr);
    if (on) {
      const raw = el.getAttribute(attr)!;
      const colonIdx = raw.indexOf(":");
      if (colonIdx === -1) {
        return {
          type: "on",
          event: on.event,
          targetEvent: raw.trim(),
          args: [],
        };
      }
      return {
        type: "on",
        event: on.event,
        targetEvent: raw.slice(0, colonIdx).trim(),
        args: raw.slice(colonIdx + 1).split(",").map((s) => s.trim()),
      };
    }
  }
  return null;
}

export function bindComponent(host: HTMLElement, root: ShadowRoot): void {
  const system = getSystem();
  if (!system) return;

  const unbindFns: (() => void)[] = [];
  const elements = root.querySelectorAll("*");

  for (const el of elements) {
    const binding = parseBinding(el);
    if (!binding) continue;

    switch (binding.type) {
      case "text": {
        // Set initial value
        el.textContent = String(system.readField(binding.field) ?? "");
        // Subscribe to changes
        const unsub = system.onFieldChange(binding.field, (val) => {
          el.textContent = String(val ?? "");
        });
        unbindFns.push(unsub);
        break;
      }

      case "bind": {
        const vals: unknown[] = new Array(binding.fields.length).fill(undefined);
        // Set initial values
        binding.fields.forEach((fieldName, i) => {
          vals[i] = system.readField(fieldName);
        });
        applyBindTemplate(el, binding, vals);
        // Subscribe to changes
        binding.fields.forEach((fieldName, i) => {
          const unsub = system.onFieldChange(fieldName, (val) => {
            vals[i] = val;
            applyBindTemplate(el, binding, vals);
          });
          unbindFns.push(unsub);
        });
        break;
      }

      case "toggle": {
        const htEl = el as HTMLElement;
        htEl.hidden = !Boolean(system.readField(binding.field));
        const unsub = system.onFieldChange(binding.field, (val) => {
          htEl.hidden = !Boolean(val);
        });
        unbindFns.push(unsub);
        break;
      }

      case "on": {
        const evtObj = system.event(binding.targetEvent);
        if (!evtObj) {
          console.warn(`mf-on: unknown event "${binding.targetEvent}" on element`, el);
          break;
        }
        const payload = binding.args.length === 0
          ? undefined
          : binding.args.length === 1
          ? tryParseNumber(binding.args[0])
          : binding.args.map((a) => tryParseNumber(a));
        const handler = () => {
          system.fire(evtObj, payload as any);
        };
        el.addEventListener(binding.event, handler);
        unbindFns.push(() => el.removeEventListener(binding.event, handler));
        break;
      }
    }
  }

  // Store unbind functions for cleanup
  (host as any).__mf_unbind = unbindFns;
}

function tryParseNumber(s: string): string | number {
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== "") return n;
  return s;
}

function applyBindTemplate(
  el: Element,
  binding: ParsedBinding & { type: "bind" },
  vals: unknown[],
): void {
  const rendered = binding.template.replace(
    /\{(\d+)\}/g,
    (_, idx) => String(vals[Number(idx)] ?? ""),
  );
  if (binding.attr === "style") {
    (el as HTMLElement).style.cssText = rendered;
  } else {
    el.setAttribute(binding.attr, rendered);
  }
}
