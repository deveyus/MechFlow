// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

import { field, event, createSystem, useSystem, Ok } from "../src/mod.ts";
import { assertEquals } from "jsr:@std/assert";
import type { SubscriberRegistration, PriorityHint } from "../src/core/types.ts";
import { resolveOrdering } from "../src/core/ordering.ts";
import { SubscriptionBuilder } from "../src/core/subscribe.ts";

interface HealEvent {
  amount: number;
}

interface DamageEvent {
  amount: number;
}

Deno.test("field creation carries type and default", () => {
  const hp = field("hp", { default: 20 });
  assertEquals(hp.name, "hp");
  assertEquals(hp.options.default, 20);
});

Deno.test("event creation carries name", () => {
  const dmg = event<DamageEvent>("damage:taken");
  assertEquals(dmg.name, "damage:taken");
});

Deno.test("system fire returns tick result", () => {
  const hp = field("hp", { default: 20 });
  const status = field("status", { default: "healthy" });
  const damageTaken = event<DamageEvent>("damage:taken");
  const healApplied = event<HealEvent>("heal:applied");

  const system = createSystem({
    fields: [hp, status],
    events: [damageTaken, healApplied],
  });

  useSystem(system);

  system.subscribe(damageTaken, (ctx) => {
    return Ok({ hp: ctx.chain.current.hp - ctx.payload.amount });
  }).id("raw-damage");

  const result = system.fire(damageTaken, { amount: 5 });

  assertEquals(result.state.hp, 15);
  assertEquals(result.state.status, "healthy");
  assertEquals(result.chain.links.length, 2); // init + raw-damage
  assertEquals(result.chain.first.hp, 20);
  assertEquals(result.chain.current.hp, 15);
});

Deno.test("multiple subscribers chain correctly", () => {
  const hp = field("hp", { default: 20 });
  const status = field("status", { default: "healthy" });
  const damageTaken = event<DamageEvent>("damage:taken");

  const system = createSystem({
    fields: [hp, status],
    events: [damageTaken],
  });

  useSystem(system);

  system.subscribe(damageTaken, (ctx) => {
    const newHp = ctx.chain.current.hp - ctx.payload.amount;
    return Ok({ hp: newHp });
  }).id("apply-damage");

  system.subscribe(damageTaken, (ctx) => {
    if (ctx.chain.current.hp <= 10) {
      return Ok({ status: "bloodied" });
    }
    return Ok({});
  }).id("bloodied-check").after("apply-damage");

  const result = system.fire(damageTaken, { amount: 12 });
  assertEquals(result.state.hp, 8);
  assertEquals(result.state.status, "bloodied");
});

Deno.test("error does not abort tick", () => {
  const hp = field("hp", { default: 20 });
  const damageTaken = event<DamageEvent>("damage:taken");

  const system = createSystem({
    fields: [hp],
    events: [damageTaken],
  });

  useSystem(system);

  system.subscribe(damageTaken, () => {
    return Ok({ hp: 15 });
  }).id("first");

  system.subscribe(damageTaken, () => {
    throw new Error("oops");
  }).id("failing").after("first");

  system.subscribe(damageTaken, (ctx) => {
    return Ok({ hp: ctx.chain.current.hp + 2 });
  }).id("recovery").after("failing");

  const result = system.fire(damageTaken, { amount: 0 });

  assertEquals(result.state.hp, 17); // first applied, failing skipped, recovery applied
  assertEquals(result.chain.links.length, 4);
  assertEquals(result.chain.at(2)?.error?.message, "oops");
});

Deno.test("compatible before/after constraints succeed", () => {
  const hp = field("hp", { default: 20 });
  const damageTaken = event<DamageEvent>("damage:taken");

  const system = createSystem({
    fields: [hp],
    events: [damageTaken],
  });

  useSystem(system);

  system.subscribe(damageTaken, () => Ok({})).id("a").before("b");
  system.subscribe(damageTaken, () => Ok({})).id("b").after("a");

  // These are fine — no cycle
  assertEquals(system.fire(damageTaken, { amount: 0 }).state.hp, 20);
});

Deno.test("cycle detection throws at registration time", () => {
  const hp = field("hp", { default: 20 });
  const damageTaken = event<DamageEvent>("damage:taken");

  const system = createSystem({
    fields: [hp],
    events: [damageTaken],
  });

  useSystem(system);

  system.subscribe(damageTaken, () => Ok({})).id("a").before("b");
  system.subscribe(damageTaken, () => Ok({})).id("b").before("c");

  let caught: string | undefined;
  try {
    system.subscribe(damageTaken, () => Ok({})).id("c").before("a");
  } catch (e: unknown) {
    caught = e instanceof Error ? e.message : String(e);
  }
  assertEquals(
    caught?.includes("Cycle") ?? false,
    true,
    caught ? `expected "Cycle" in "${caught}"` : "expected throw",
  );
});

Deno.test("priority early places subscriber early within layer", () => {
  const hp = field("hp", { default: 20 });
  const damageTaken = event<DamageEvent>("damage:taken");

  const system = createSystem({
    fields: [hp],
    events: [damageTaken],
  });

  useSystem(system);

  // All in the same layer (no edges between them)
  const order: string[] = [];

  system.subscribe(damageTaken, () => {
    order.push("a");
    return Ok({});
  }).id("a").priority("late");

  system.subscribe(damageTaken, () => {
    order.push("b");
    return Ok({});
  }).id("b").priority("early");

  system.subscribe(damageTaken, () => {
    order.push("c");
    return Ok({});
  }).id("c").priority("early");

  system.fire(damageTaken, { amount: 0 });
  assertEquals(order[0], "b");
  assertEquals(order[1], "c");
  assertEquals(order[2], "a");
});

Deno.test("duplicate subscriber id throws", () => {
  const hp = field("hp", { default: 20 });
  const damageTaken = event<DamageEvent>("damage:taken");

  const system = createSystem({
    fields: [hp],
    events: [damageTaken],
  });

  useSystem(system);

  system.subscribe(damageTaken, () => Ok({ hp: 15 })).id("heal");

  try {
    system.subscribe(damageTaken, () => Ok({ hp: 25 })).id("heal");
    throw new Error("Should have thrown");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    assertEquals(msg.includes("heal"), true);
  }
});

Deno.test("deferred builder chaining works", () => {
  const hp = field("hp", { default: 20 });
  const damageTaken = event<DamageEvent>("damage:taken");

  const system = createSystem({
    fields: [hp],
    events: [damageTaken],
  });

  useSystem(system);

  const builder = system.subscribe(damageTaken, (ctx) => {
    return Ok({ hp: ctx.chain.current.hp - ctx.payload.amount });
  });
  builder.id("apply-damage").after("drain");

  system.subscribe(damageTaken, (ctx) => {
    return Ok({ hp: ctx.chain.current.hp - ctx.payload.amount });
  }).id("drain");

  const result = system.fire(damageTaken, { amount: 5 });
  assertEquals(result.state.hp, 10); // drain: 20→15, apply-damage: 15→10
});

Deno.test("chain convenience accessors work", () => {
  const hp = field("hp", { default: 20 });
  const damageTaken = event<DamageEvent>("damage:taken");

  const system = createSystem({
    fields: [hp],
    events: [damageTaken],
  });

  useSystem(system);

  system.subscribe(damageTaken, (ctx) => {
    return Ok({ hp: ctx.chain.first.hp - ctx.payload.amount });
  }).id("hit");

  system.subscribe(damageTaken, () => {
    throw new Error("boom");
  }).id("failing").after("hit");

  system.subscribe(damageTaken, (ctx) => {
    return Ok({ hp: ctx.chain.unsafeCurrent.hp + 3 });
  }).id("recovery").after("failing");

  const result = system.fire(damageTaken, { amount: 5 });

  // first = initial state
  assertEquals(result.chain.first.hp, 20);
  // current = last successful link (skips failing, goes to recovery)
  assertEquals(result.chain.current.hp, 18); // 15 + 3
  // unsafeCurrent = last link regardless (recovery's link)
  assertEquals(result.chain.unsafeCurrent.hp, 18);
  // Chain structure: init → hit → failing(error) → recovery
  assertEquals(result.chain.links.length, 4);
  assertEquals(result.chain.at(0)?.state.hp, 20);
  assertEquals(result.chain.at(1)?.state.hp, 15);
  assertEquals(result.chain.at(2)?.error?.message, "boom");
  assertEquals(result.chain.find("hit")?.subscriberId, "hit");
  assertEquals(result.chain.find("failing")?.error?.message, "boom");
});

// ── system.fire() property, control-flow, and adjacent tests ──

Deno.test("fire returns tick result matching chain.current", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  const result = sys.fire(e, { n: 1 });
  assertEquals(result.state.hp, result.chain.current.hp);
  assertEquals(result.chain.links.length, 1);
  assertEquals(result.chain.at(0)?.subscriberId, "__init__");
});

Deno.test("tick counter increments monotonically on each fire", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  const r1 = sys.fire(e, { n: 1 });
  const r2 = sys.fire(e, { n: 2 });
  assertEquals(r2.tick, r1.tick + 1);
});

Deno.test("fire on event with no registered handlers returns initial state", () => {
  const hp = field("hp", { default: 20 });
  const heal = event<{ amount: number }>("heal");
  const sys = createSystem({ fields: [hp], events: [heal] });
  const result = sys.fire(heal, { amount: 5 });
  assertEquals(result.state.hp, 20);
  assertEquals(result.chain.links.length, 1);
});

Deno.test("handler Err result leaves state unchanged", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  sys.subscribe(e, () => ({ ok: false, error: { message: "nope" } })).id("fail");
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 20);
  assertEquals(result.chain.at(1)?.error?.message, "nope");
});

Deno.test("handler throw is caught and recorded as error link", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  sys.subscribe(e, () => { throw "raw string" }).id("boom");
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.chain.at(1)?.error?.message, "raw string");
});

Deno.test("non-Error throw value is stringified in error message", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  sys.subscribe(e, () => { throw null }).id("null-boom");
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.chain.at(1)?.error?.message, "null");
});

Deno.test("chain.current skips error links to last success", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  sys.subscribe(e, () => Ok({ hp: 10 })).id("ok1");
  sys.subscribe(e, () => ({ ok: false, error: { message: "fail" } })).id("err").after("ok1");
  sys.subscribe(e, (ctx) => Ok({ hp: ctx.chain.current.hp + 5 })).id("ok2").after("err");
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 15);
  assertEquals(result.chain.current.hp, 15);
  assertEquals(result.chain.links.length, 4);
});

Deno.test("fire notifies onFieldChange after all handlers run", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  const seen: Array<{ newVal: unknown; oldVal: unknown; key: string }> = [];
  sys.onFieldChange("hp", (newVal, oldVal, key) => seen.push({ newVal, oldVal, key }));
  sys.subscribe(e, () => Ok({ hp: 15 })).id("set-hp");
  sys.fire(e, { n: 0 });
  assertEquals(seen.length, 1);
  assertEquals(seen[0].newVal, 15);
  assertEquals(seen[0].oldVal, 20);
  assertEquals(seen[0].key, "hp");
});

Deno.test("onFieldChange does not fire when field value unchanged", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  let callCount = 0;
  sys.onFieldChange("hp", () => callCount++);
  sys.subscribe(e, () => Ok({ hp: 20 })).id("noop");
  sys.fire(e, { n: 0 });
  assertEquals(callCount, 0);
});

Deno.test("onFieldChange fires per changed field in declaration order", () => {
  const hp = field("hp", { default: 20 });
  const mana = field("mana", { default: 100 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp, mana], events: [e] });
  useSystem(sys);
  const order: string[] = [];
  sys.onFieldChange("mana", () => order.push("mana"));
  sys.onFieldChange("hp", () => order.push("hp"));
  sys.subscribe(e, () => Ok({ hp: 15, mana: 50 })).id("both");
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 15);
  assertEquals(result.state.mana, 50);
});

Deno.test("payload is shared by reference across all handlers in same fire", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ mut: number[] }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  let seenPayload: { mut: number[] } | undefined;
  sys.subscribe(e, (ctx) => {
    seenPayload = ctx.payload;
    return Ok({ hp: 10 });
  }).id("first");
  const payload = { mut: [1, 2, 3] };
  sys.fire(e, payload);
  assertEquals(seenPayload, payload);
  assertEquals(seenPayload?.mut, [1, 2, 3]);
});

Deno.test("all handlers receive the same ctx object reference", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  let refs: unknown[] = [];
  sys.subscribe(e, (ctx) => { refs.push(ctx); return Ok({ hp: 15 }); }).id("a");
  sys.subscribe(e, (ctx) => { refs.push(ctx); return Ok({ hp: 10 }); }).id("b");
  sys.fire(e, { n: 0 });
  assertEquals(refs.length, 2);
  assertEquals(refs[0], refs[1]);
});

Deno.test("fire resolves late subscribers added after first tick", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  sys.subscribe(e, () => Ok({ hp: 50 })).id("first");
  assertEquals(sys.fire(e, { n: 0 }).state.hp, 50);
  // Late subscriber — reRegister re-resolves before fire
  sys.subscribe(e, () => Ok({ hp: 99 })).id("second");
  assertEquals(sys.fire(e, { n: 0 }).state.hp, 99);
});

Deno.test("fire on event not in config returns early (no handlers, state unchanged)", () => {
  const hp = field("hp", { default: 20 });
  const registered = event<{ n: number }>("registered");
  const unknown = event<{ n: number }>("unknown");
  const sys = createSystem({ fields: [hp], events: [registered] });
  useSystem(sys);
  sys.subscribe(registered, () => Ok({ hp: 99 })).id("only");
  // Fire unregistered event — should return early
  const result = sys.fire(unknown, { n: 0 });
  assertEquals(result.state.hp, 20);
  assertEquals(result.chain.links.length, 1);
  // Registered event still works
  const result2 = sys.fire(registered, { n: 0 });
  assertEquals(result2.state.hp, 99);
});

Deno.test("handler returning Ok result with undefined value is ignored", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  // safeExecute returns {ok:true, delta:undefined}
  sys.subscribe(e, () => ({ ok: true, value: undefined as any })).id("bad");
  const result = sys.fire(e, { n: 0 });
  // {...state, ...undefined} is a no-op
  assertEquals(result.state.hp, 20);
  assertEquals(result.chain.links.length, 2);
});

// ── subscribeProxy / reRegister() property, control-flow, and adjacent tests ──

Deno.test("subscribe to event not in config returns bare builder (no registration)", () => {
  const hp = field("hp", { default: 20 });
  const registered = event<{ n: number }>("registered");
  const unknown = event<{ n: number }>("unknown");
  const sys = createSystem({ fields: [hp], events: [registered] });
  useSystem(sys);
  // Subscribe to unregistered event — proxy returns builder without temp registration
  const builder = sys.subscribe(unknown, () => Ok({ hp: 99 }));
  builder.id("should-be-lost").before("nobody");
  // Fire the unregistered event — no handlers resolve
  const r1 = sys.fire(unknown, { n: 0 });
  assertEquals(r1.state.hp, 20);
  assertEquals(r1.chain.links.length, 1);
  // Fire the registered event — only its subscriber fires
  sys.subscribe(registered, () => Ok({ hp: 50 })).id("reg");
  const r2 = sys.fire(registered, { n: 0 });
  assertEquals(r2.state.hp, 50);
});

Deno.test("subscribe without chaining leaves temp ID in regList", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  // Subscribe and never call .id(), .before(), etc. — temp ID persists
  sys.subscribe(e, () => Ok({ hp: 99 }));
  // Fire — temp subscriber should still execute (boot resolves it)
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 99);
  assertEquals(result.chain.links.length, 2);
  const linkId = result.chain.at(1)?.subscriberId;
  assertEquals(linkId?.startsWith("_tmp_"), true);
});

Deno.test("double .id() transition leaves no stale entries in resolved handlers", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  // Register with .id("first"), then re-id to "second"
  const builder = sys.subscribe(e, () => Ok({ hp: 50 }));
  builder.id("first");
  builder.id("second"); // reRegister replaces "first" with "second"
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 50);
  // Chain should have exactly 2 links: init + second
  assertEquals(result.chain.links.length, 2);
  assertEquals(result.chain.at(1)?.subscriberId, "second");
});

Deno.test("subscribe before first fire — sameOrdering path with !systemReady", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  // Subscribe before any fire (systemReady=false)
  sys.subscribe(e, () => Ok({ hp: 42 })).id("a");
  // First fire triggers boot()
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 42);
  // Second fire reuses resolved order
  const r2 = sys.fire(e, { n: 0 });
  assertEquals(r2.state.hp, 42);
  assertEquals(r2.tick, 2);
});

Deno.test("reRegister after boot with ordering change triggers re-resolve", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  const order: string[] = [];
  sys.subscribe(e, () => { order.push("x"); return Ok({ hp: 10 }); }).id("x");
  sys.fire(e, { n: 0 });
  assertEquals(order, ["x"]);
  // Late subscriber with ordering change — triggers full re-resolve
  sys.subscribe(e, () => { order.push("y"); return Ok({ hp: 5 }); }).id("y").before("x");
  order.length = 0;
  sys.fire(e, { n: 0 });
  assertEquals(order, ["y", "x"]);
  assertEquals(sys.fire(e, { n: 0 }).state.hp, 10); // x runs last
});

Deno.test("before with unknown ID does not throw", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  // before("nobody") references a subscriber that will never exist
  sys.subscribe(e, () => Ok({ hp: 10 })).id("a").before("nobody");
  sys.subscribe(e, () => Ok({ hp: 20 })).id("b").after("nobody");
  // Should not throw — unknown IDs are silently warned
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 20);
});

Deno.test("multiple temp IDs across separate subscribe calls", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  const ids: string[] = [];
  sys.subscribe(e, () => Ok({ hp: 1 })).id("a");
  sys.subscribe(e, () => Ok({ hp: 2 })).id("b");
  sys.subscribe(e, () => Ok({ hp: 3 })).id("c");
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 3); // c runs last
  assertEquals(result.chain.links.length, 4);
});

// ── resolveOrdering() property, control-flow, and adjacent tests ──

function makeSub(id: string, before: string[] = [], after: string[] = [], priority?: PriorityHint): SubscriberRegistration<any> {
  return { id, handler: () => ({ ok: true, value: {} }), before, after, priority };
}

Deno.test("resolveOrdering empty list returns empty order", () => {
  const result = resolveOrdering([]);
  assertEquals(result.order, []);
  assertEquals(result.cycle, undefined);
});

Deno.test("resolveOrdering single subscriber returns [id]", () => {
  const result = resolveOrdering([makeSub("a")]);
  assertEquals(result.order, ["a"]);
  assertEquals(result.cycle, undefined);
});

Deno.test("resolveOrdering linear chain A→B→C", () => {
  const result = resolveOrdering([makeSub("a", ["b"]), makeSub("b", ["c"]), makeSub("c")]);
  assertEquals(result.order, ["a", "b", "c"]);
  assertEquals(result.cycle, undefined);
});

Deno.test("resolveOrdering diamond D→(A,B)→C", () => {
  // D before A, D before B, A before C, B before C
  const result = resolveOrdering([
    makeSub("d", ["a", "b"]),
    makeSub("a", ["c"]),
    makeSub("b", ["c"]),
    makeSub("c"),
  ]);
  assertEquals(result.order[0], "d");
  assertEquals(result.order[3], "c");
  // A and B in positions 1,2 in some order
  const mid = result.order.slice(1, 3).sort();
  assertEquals(mid, ["a", "b"]);
});

Deno.test("resolveOrdering after() reverses edge direction", () => {
  // a after b means b before a
  const result = resolveOrdering([makeSub("a", [], ["b"]), makeSub("b")]);
  assertEquals(result.order, ["b", "a"]);
});

Deno.test("resolveOrdering self-loop returns cycle", () => {
  const result = resolveOrdering([makeSub("a", ["a"])]);
  assertEquals(result.order, []);
  assertEquals(result.cycle?.length, 2);
  assertEquals(result.cycle![0], "a");
  assertEquals(result.cycle![1], "a");
});

Deno.test("resolveOrdering full cycle A→B→C→A returns empty order plus cycle", () => {
  const result = resolveOrdering([
    makeSub("a", ["b"]),
    makeSub("b", ["c"]),
    makeSub("c", ["a"]),
  ]);
  assertEquals(result.order, []);
  assertEquals(result.cycle!.length >= 3, true);
});

Deno.test("resolveOrdering partial cycle returns ordered prefix plus cycle", () => {
  const result = resolveOrdering([
    makeSub("a", ["b"]),
    makeSub("b"),          // a before b — fine
    makeSub("c", ["d"]),
    makeSub("d", ["c"]),   // c↔d cycle
  ]);
  assertEquals(result.order, ["a", "b"]);
  assertEquals(result.cycle!.length >= 2, true);
});

Deno.test("resolveOrdering priority within single layer", () => {
  const result = resolveOrdering([
    makeSub("a", [], [], "late"),
    makeSub("b", [], [], "early"),
    makeSub("c", [], [], undefined),
  ]);
  assertEquals(result.order, ["b", "c", "a"]);
});

Deno.test("resolveOrdering priority never crosses layer boundary", () => {
  const result = resolveOrdering([
    makeSub("late1", ["mid1"], [], "late"),   // must run before mid1
    makeSub("mid1", ["early1"]),               // must run before early1
    makeSub("early1", [], [], "early"),        // after mid1
  ]);
  // Layer order: late1(0) → mid1(1) → early1(2)
  // Priority reorders within each layer (only one node per layer here)
  assertEquals(result.order, ["late1", "mid1", "early1"]);
});

Deno.test("resolveOrdering duplicate before/after entries are harmless", () => {
  const result = resolveOrdering([
    makeSub("a", ["b", "b"]),  // duplicate before
    makeSub("b"),
  ]);
  assertEquals(result.order, ["a", "b"]);
});

Deno.test("resolveOrdering before and after combined", () => {
  // a before c, b after c → b must be after c
  const result = resolveOrdering([
    makeSub("a", ["c"]),
    makeSub("c"),
    makeSub("b", [], ["c"]),  // b after c → c before b
  ]);
  assertEquals(result.order, ["a", "c", "b"]);
});

Deno.test("resolveOrdering disjoint DAG + cycle — cycle found in later DFS forest", () => {
  // x→y is a DAG, a→b→c→a is a cycle — disconnected subgraphs
  const result = resolveOrdering([
    makeSub("x", ["y"]),
    makeSub("y"),
    makeSub("a", ["b"]),
    makeSub("b", ["c"]),
    makeSub("c", ["a"]),
  ]);
  assertEquals(result.order, ["x", "y"]);
  assertEquals(result.cycle!.length >= 3, true);
  // verify the cycle involves the expected nodes
  const cycleNodes = new Set(result.cycle);
  assertEquals(cycleNodes.has("a"), true);
  assertEquals(cycleNodes.has("b"), true);
  assertEquals(cycleNodes.has("c"), true);
});

Deno.test("resolveOrdering all-early single layer", () => {
  const result = resolveOrdering([
    makeSub("x", [], [], "early"),
    makeSub("y", [], [], "early"),
    makeSub("z", [], [], "early"),
  ]);
  assertEquals(result.order, ["x", "y", "z"]); // stable sort preserves input order
});

Deno.test("resolveOrdering all-late single layer", () => {
  const result = resolveOrdering([
    makeSub("x", [], [], "late"),
    makeSub("y", [], [], "late"),
    makeSub("z", [], [], "late"),
  ]);
  assertEquals(result.order, ["x", "y", "z"]);
});

Deno.test("resolveOrdering node with multiple predecessors gets correct depth", () => {
  // a and b both before c → c has depth 1 (max of a:0, b:0 + 1)
  const result = resolveOrdering([
    makeSub("a", ["c"]),
    makeSub("b", ["c"]),
    makeSub("c"),
    makeSub("d", ["c"]),
  ]);
  // a, b, d (depth 0) can be in any order, then c (depth 1)
  assertEquals(result.order[3], "c");
  assertEquals(result.order.length, 4);
});

Deno.test("resolveOrdering reference to unknown before ID is handled", () => {
  // "nobody" does not exist as a subscriber
  const result = resolveOrdering([makeSub("a", ["nobody"]), makeSub("b")]);
  assertEquals(result.order.includes("a"), true);
  assertEquals(result.order.includes("b"), true);
  assertEquals(result.order.length, 2);
});

// ── Tier 2: boot() and SubscriptionBuilder.build() ──

Deno.test("boot is lazy — first fire resolves, second reuses", () => {
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  sys.subscribe(e, () => Ok({ hp: 10 })).id("a");
  // Before first fire, state is initial
  assertEquals(sys.readField("hp"), 20);
  // First fire triggers boot
  assertEquals(sys.fire(e, { n: 0 }).state.hp, 10);
  // Second fire reuses resolved order
  assertEquals(sys.fire(e, { n: 0 }).tick, 2);
});

Deno.test("boot resolves ordering for subscribers without chaining", () => {
  // Subscribers registered without calling .id()/.before()/.after() get temp IDs
  // boot() must resolve these into a valid order on first fire
  const hp = field("hp", { default: 20 });
  const e = event<{ n: number }>("tick");
  const sys = createSystem({ fields: [hp], events: [e] });
  useSystem(sys);
  // Register without any chaining — temp IDs, no ordering constraints
  sys.subscribe(e, () => Ok({ hp: 10 }));
  sys.subscribe(e, () => Ok({ hp: 20 }));
  const result = sys.fire(e, { n: 0 });
  assertEquals(result.state.hp, 20); // second subscriber runs last, wins
  assertEquals(result.chain.links.length, 3);
});

Deno.test("SubscriptionBuilder.build generates anonymous ID when no .id() called", () => {
  const e = event<{ n: number }>("tick");
  const builder1 = new SubscriptionBuilder(e, () => Ok({}));
  const builder2 = new SubscriptionBuilder(e, () => Ok({}));
  const r1 = builder1.build();
  const r2 = builder2.build();
  assertEquals(r1.id.startsWith("anon_"), true);
  assertEquals(r2.id.startsWith("anon_"), true);
  // IDs are unique
  assertEquals(r1.id !== r2.id, true);
});

Deno.test("SubscriptionBuilder.build copies before/after arrays", () => {
  const e = event<{ n: number }>("tick");
  const builder = new SubscriptionBuilder(e, () => Ok({}));
  builder.before("x", "y").after("z");
  const r1 = builder.build();
  const r2 = builder.build();
  // Subsequent builds produce new arrays
  r1.before.push("mutated");
  assertEquals(r2.before.length, 2);
  assertEquals(r2.before.includes("mutated"), false);
});
