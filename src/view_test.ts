// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

/// <reference lib="dom" />

import { assertEquals } from "jsr:@std/assert";
import { parseBinding, tryParseNumber } from "./view/bindings.ts";

// ── parseBinding tests (pure string parsing, mock Element) ──

function mockEl(attrs: Record<string, string>): Element {
  return {
    getAttributeNames: () => Object.keys(attrs),
    getAttribute: (name: string) => attrs[name] ?? null,
  } as unknown as Element;
}

Deno.test("parseBinding mf-text returns text binding", () => {
  const result = parseBinding(mockEl({ "mf-text": "hp" }));
  assertEquals(result, { type: "text", field: "hp" });
});

Deno.test("parseBinding mf-toggle returns toggle binding", () => {
  const result = parseBinding(mockEl({ "mf-toggle": "isVisible" }));
  assertEquals(result, { type: "toggle", field: "isVisible" });
});

Deno.test("parseBinding mf-bind with pipe uses template and fields", () => {
  const result = parseBinding(mockEl({ "mf-bind:class": "status-{0} | hp, mana" }));
  assertEquals(result, {
    type: "bind",
    attr: "class",
    fields: ["hp", "mana"],
    template: "status-{0}",
  });
});

Deno.test("parseBinding mf-bind without pipe uses raw value as field", () => {
  const result = parseBinding(mockEl({ "mf-bind:hidden": "isDead" }));
  assertEquals(result, {
    type: "bind",
    attr: "hidden",
    fields: ["isDead"],
    template: "{0}",
  });
});

Deno.test("parseBinding mf-on with payload parses target and args", () => {
  const result = parseBinding(mockEl({ "mf-on:click": "takeDamage:5" }));
  assertEquals(result, {
    type: "on",
    event: "click",
    targetEvent: "takeDamage",
    args: ["5"],
  });
});

Deno.test("parseBinding mf-on without payload uses raw as target event", () => {
  const result = parseBinding(mockEl({ "mf-on:click": "takeDamage" }));
  assertEquals(result, {
    type: "on",
    event: "click",
    targetEvent: "takeDamage",
    args: [],
  });
});

Deno.test("parseBinding no matching attributes returns null", () => {
  const result = parseBinding(mockEl({ class: "foo", id: "bar" }));
  assertEquals(result, null);
});

Deno.test("parseBinding first matching attribute wins (mf-text before mf-bind)", () => {
  const result = parseBinding(mockEl({ "mf-text": "hp", "mf-bind:class": "foo | hp" }));
  assertEquals(result, { type: "text", field: "hp" });
});

Deno.test("parseBinding mf-bind with empty template and single field", () => {
  const result = parseBinding(mockEl({ "mf-bind:style": "| hp" }));
  assertEquals(result, {
    type: "bind",
    attr: "style",
    fields: ["hp"],
    template: "",
  });
});

Deno.test("parseBinding mf-on with multiple comma args", () => {
  const result = parseBinding(mockEl({ "mf-on:submit": "heal: 10, 20" }));
  assertEquals(result, {
    type: "on",
    event: "submit",
    targetEvent: "heal",
    args: ["10", "20"],
  });
});

// ── tryParseNumber tests ──

Deno.test("tryParseNumber numeric string returns number", () => {
  assertEquals(tryParseNumber("42"), 42);
  assertEquals(tryParseNumber("0"), 0);
  assertEquals(tryParseNumber("-3"), -3);
  assertEquals(tryParseNumber("3.14"), 3.14);
});

Deno.test("tryParseNumber non-numeric string returns original", () => {
  assertEquals(tryParseNumber("hello"), "hello");
});

Deno.test("tryParseNumber empty string returns original", () => {
  assertEquals(tryParseNumber(""), "");
});

Deno.test("tryParseNumber whitespace returns original", () => {
  assertEquals(tryParseNumber("   "), "   ");
});

Deno.test("tryParseNumber string NaN returns original string", () => {
  assertEquals(tryParseNumber("NaN"), "NaN");
});
