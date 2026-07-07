/// <reference lib="dom" />

const ATTR_PATTERN = /^mf-/;

type BindingType = "text" | "bind" | "toggle" | "on" | "scope";

const BINDING_ATTRS: Record<string, BindingType> = {
  "mf-text": "text",
  "mf-toggle": "toggle",
};

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

type ParsedBinding =
  | { type: "text"; field: string }
  | { type: "bind"; attr: string; fields: string[]; template: string }
  | { type: "toggle"; field: string; className: string }
  | { type: "on"; event: string; targetEvent: string; args: string[] }
  | { type: "scope"; value: string };

function parseBinding(el: Element): ParsedBinding | null {
  for (const attr of el.getAttributeNames()) {
    if (attr === "mf-text") {
      return { type: "text", field: el.getAttribute(attr)! };
    }
    if (attr === "mf-toggle") {
      return { type: "toggle", field: el.getAttribute(attr)!, className: el.getAttribute(attr)! };
    }
    const bind = parseBindAttr(attr);
    if (bind) {
      const raw = el.getAttribute(attr)!;
      const pipeIdx = raw.indexOf("|");
      if (pipeIdx === -1) {
        // Single field, no template — field name IS the value
        return { type: "bind", attr: bind.attr, fields: [raw.trim()], template: "{0}" };
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
        return { type: "on", event: on.event, targetEvent: raw.trim(), args: [] };
      }
      return {
        type: "on",
        event: on.event,
        targetEvent: raw.slice(0, colonIdx).trim(),
        args: raw.slice(colonIdx + 1).split(",").map((s) => s.trim()),
      };
    }
    if (attr === "mf-scope") {
      return { type: "scope", value: el.getAttribute(attr)! };
    }
  }
  return null;
}

export function walkBindings(root: DocumentFragment | ShadowRoot): void {
  const elements = root.querySelectorAll("*");
  for (const el of elements) {
    const binding = parseBinding(el);
    if (!binding) continue;
  }
}

export function bindComponent(host: HTMLElement, root: ShadowRoot): void {
  const elements = root.querySelectorAll("*");
  for (const el of elements) {
    const binding = parseBinding(el);
    if (!binding) continue;

    switch (binding.type) {
      case "text":
        subscribeElement(host, binding.field, (val) => {
          el.textContent = String(val ?? "");
        });
        break;

      case "bind": {
        const vals: unknown[] = new Array(binding.fields.length).fill(undefined);
        binding.fields.forEach((fieldName, i) => {
          subscribeElement(host, fieldName, (val) => {
            vals[i] = val;
            const rendered = binding.template.replace(
              /\{(\d+)\}/g,
              (_, idx) => String(vals[Number(idx)] ?? ""),
            );
            if (binding.attr === "style") {
              (el as HTMLElement).style.cssText = rendered;
            } else {
              el.setAttribute(binding.attr, rendered);
            }
          });
        });
        break;
      }

      case "toggle":
        subscribeElement(host, binding.field, (val) => {
          if (val) {
            el.classList.add(binding.className);
          } else {
            el.classList.remove(binding.className);
          }
        });
        break;

      case "on":
        el.addEventListener(binding.event, () => {
          import("../core/system.ts").then(({ getSystem }) => {
            const sys = getSystem();
            if (sys) {
              sys.fire({ name: binding.targetEvent } as any, binding.args as any);
            }
          });
        });
        break;
    }
  }
}

function subscribeElement(
  host: HTMLElement,
  fieldName: string,
  cb: (val: unknown) => void,
): void {
  import("../core/system.ts").then(({ getSystem }) => {
    const sys = getSystem();
    if (!sys) return;

    // Set initial value
    const f = sys.field(fieldName);
    // Ideally we'd subscribe to changes here
    // For now, fire field-get as simple access
    cb(f?.options.default);
  });
}
