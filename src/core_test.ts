// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

import { field, event, createSystem, useSystem, Ok } from "../src/mod.ts";
import { assertEquals } from "jsr:@std/assert";

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
