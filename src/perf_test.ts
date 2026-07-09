// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: EUPL-1.2

import { field, event, createSystem, Ok } from "./mod.ts";

function benchmarkSubscriberCount(count: number): { count: number; bootMs: number; tickMs: number; opsPerSec: number } {
  const f = field("val", { default: 0 });
  const evt = event<{ x: number }>("tick");

  const system = createSystem({ fields: [f], events: [evt] });

  for (let i = 0; i < count; i++) {
    system.subscribe(evt, (ctx) => {
      return Ok({ val: ctx.chain.current.val + 1 });
    }).id(`sub-${i}`);
  }

  // warmup: triggers boot() + first tick
  system.fire(evt, { x: 1 });

  const start = performance.now();
  system.fire(evt, { x: 1 });
  const elapsed = performance.now() - start;

  // Also measure boot separately by creating a fresh system
  const sys2 = createSystem({ fields: [f], events: [evt] });
  for (let i = 0; i < count; i++) {
    sys2.subscribe(evt, (ctx) => {
      return Ok({ val: ctx.chain.current.val + 1 });
    }).id(`sub-${i}`);
  }
  const bootStart = performance.now();
  sys2.fire(evt, { x: 1 });
  const bootElapsed = performance.now() - bootStart;

  return {
    count,
    bootMs: parseFloat(bootElapsed.toFixed(4)),
    tickMs: parseFloat(elapsed.toFixed(4)),
    opsPerSec: Math.round(1000 / elapsed),
  };
}

Deno.test("perf: 10 subscribers", () => {
  const r = benchmarkSubscriberCount(10);
  console.log(`  ${r.count} subs: ${r.tickMs}ms/tick (${r.opsPerSec} ops/sec) — boot: ${r.bootMs}ms`);
});

Deno.test("perf: 100 subscribers", () => {
  const r = benchmarkSubscriberCount(100);
  console.log(`  ${r.count} subs: ${r.tickMs}ms/tick (${r.opsPerSec} ops/sec) — boot: ${r.bootMs}ms`);
});

Deno.test("perf: 500 subscribers", () => {
  const r = benchmarkSubscriberCount(500);
  console.log(`  ${r.count} subs: ${r.tickMs}ms/tick (${r.opsPerSec} ops/sec) — boot: ${r.bootMs}ms`);
});

Deno.test("perf: 2000 subscribers", () => {
  const r = benchmarkSubscriberCount(2000);
  console.log(`  ${r.count} subs: ${r.tickMs}ms/tick (${r.opsPerSec} ops/sec) — boot: ${r.bootMs}ms`);
});

function benchmarkWriteField(count: number): { count: number; writeMs: number; opsPerSec: number } {
  const f = field("val", { default: 0 });
  const system = createSystem({ fields: [f], events: [] });

  const cbs: (() => void)[] = [];
  for (let i = 0; i < count; i++) {
    cbs.push(system.onFieldChange("val", () => {}));
  }

  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    system.writeField("val", i);
  }
  const elapsed = performance.now() - start;

  for (const unsub of cbs) unsub();

  return {
    count,
    writeMs: parseFloat((elapsed / 1000).toFixed(6)),
    opsPerSec: Math.round(1000 / (elapsed / 1000)),
  };
}

Deno.test("perf: writeField — 0 listeners", () => {
  const r = benchmarkWriteField(0);
  console.log(`  ${r.count} listeners: ${r.writeMs}ms/write (${r.opsPerSec} writes/sec)`);
});

Deno.test("perf: writeField — 10 listeners", () => {
  const r = benchmarkWriteField(10);
  console.log(`  ${r.count} listeners: ${r.writeMs}ms/write (${r.opsPerSec} writes/sec)`);
});

Deno.test("perf: writeField — 100 listeners", () => {
  const r = benchmarkWriteField(100);
  console.log(`  ${r.count} listeners: ${r.writeMs}ms/write (${r.opsPerSec} writes/sec)`);
});
