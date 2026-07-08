import { field, event, createSystem, useSystem, flow, Ok } from "../src/mod.ts";

interface DamageEvent {
  amount: number;
}

interface HealEvent {
  amount: number;
}

interface TempGainedEvent {
  amount: number;
}

const hp = field("hp", { default: 20 });
const hpMax = field("hpMax", { default: 20 });
const tempHp = field("tempHp", { default: 0 });
const status = field("status", { default: "healthy" as string });
const bloodied = field("bloodied", { default: false });
const hpPercent = field("hpPercent", { default: 100 });

const damageTaken = event<DamageEvent>("damage:taken");
const healApplied = event<HealEvent>("heal:applied");
const tempGained = event<TempGainedEvent>("temp:gained");

const system = createSystem({
  fields: [hp, hpMax, tempHp, status, hpPercent, bloodied],
  events: [damageTaken, healApplied, tempGained],
});

system.subscribe(damageTaken, (ctx) => {
  const current = ctx.chain.current.hp;
  const max = ctx.chain.current.hpMax;
  return Ok({ hpPercent: max > 0 ? Math.round((current / max) * 100) : 0 });
}).id("recalc-hp-pct").after("apply-damage");

system.subscribe(damageTaken, (ctx) => {
  const remaining = ctx.payload.amount;
  const temp = ctx.chain.current.tempHp;
  let damageLeft = remaining;
  let newTemp = temp;

  if (temp > 0) {
    const absorbed = Math.min(temp, remaining);
    newTemp = temp - absorbed;
    damageLeft = remaining - absorbed;
  }

  const newHp = Math.max(0, ctx.chain.current.hp - damageLeft);
  return Ok({ hp: newHp, tempHp: newTemp });
}).id("apply-damage");

system.subscribe(damageTaken, (ctx) => {
  const max = ctx.chain.current.hpMax;
  const current = ctx.chain.current.hp;
  return Ok({
    bloodied: current <= max / 2,
    status: current <= max / 2 ? "bloodied" : "healthy",
  });
}).id("bloodied-check").after("apply-damage");

system.subscribe(healApplied, (ctx) => {
  const newHp = Math.min(ctx.chain.current.hp + ctx.payload.amount, ctx.chain.current.hpMax);
  return Ok({
    hp: newHp,
    hpPercent: Math.round((newHp / ctx.chain.current.hpMax) * 100),
  });
}).id("heal");

system.subscribe(healApplied, (ctx) => {
  const max = ctx.chain.current.hpMax;
  const current = ctx.chain.current.hp;
  const newBloodied = current <= max / 2;
  return Ok({
    bloodied: newBloodied,
    status: newBloodied ? "bloodied" : "healthy",
  });
}).id("heal-bloodied").after("heal");

system.subscribe(tempGained, (ctx) => {
  return Ok({ tempHp: Math.max(ctx.chain.current.tempHp, ctx.payload.amount) });
}).id("temp-gain");

useSystem(system);

const systemEl = document.getElementById("btn-damage-5")!;
systemEl.onclick = () => {
  system.fire(damageTaken, { amount: 5 });
};

document.getElementById("btn-damage-15")!.onclick = () => {
  system.fire(damageTaken, { amount: 15 });
};

document.getElementById("btn-heal-3")!.onclick = () => {
  system.fire(healApplied, { amount: 3 });
};

document.getElementById("btn-heal-6")!.onclick = () => {
  system.fire(healApplied, { amount: 6 });
};

document.getElementById("btn-temp-7")!.onclick = () => {
  system.fire(tempGained, { amount: 7 });
};

const hpTemplate = document.getElementById("tpl-hp-bar") as HTMLTemplateElement;
const statusTemplate = document.getElementById("tpl-status-badge") as HTMLTemplateElement;
flow("hp-bar", hpTemplate);
flow("status-badge", statusTemplate);
