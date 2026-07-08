// SPDX-FileCopyrightText: 2026 MechFlow contributors
// SPDX-License-Identifier: LGPL-3.0-or-later

import { assertEquals } from "jsr:@std/assert";

const PORT = 8765;
const TESTBED = `http://localhost:${PORT}/index.html`;

function startServer(): Deno.HttpServer {
  return Deno.serve({ port: PORT, onListen: () => {} }, (req) => {
    const url = new URL(req.url);
    const filePath = url.pathname === "/" || url.pathname === "/index.html"
      ? `${Deno.cwd()}/testbed/index.html`
      : `${Deno.cwd()}/testbed${url.pathname}`;
    try {
      const content = Deno.readFileSync(filePath);
      const ext = filePath.split(".").pop();
      const ct = ext === "html" ? "text/html" : ext === "js" ? "application/javascript" : "application/octet-stream";
      return new Response(content, { headers: { "content-type": ct } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

interface CDPClient {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onEvent(method: string, cb: (params: unknown) => void): void;
  close(): void;
}

async function connectCDP(port: number): Promise<CDPClient> {
  const targets = await (await fetch(`http://localhost:${port}/json`)).json() as { webSocketDebuggerUrl: string }[];
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);

  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  const eventHandlers = new Map<string, Set<(params: unknown) => void>>();
  let msgId = 0;

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      }
    } else if (msg.method) {
      const handlers = eventHandlers.get(msg.method);
      if (handlers) {
        for (const cb of handlers) cb(msg.params);
      }
    }
  };

  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
  });

  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++msgId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    onEvent(method, cb) {
      if (!eventHandlers.has(method)) eventHandlers.set(method, new Set());
      eventHandlers.get(method)!.add(cb);
    },
    close() { ws.close(); },
  };
}

async function evaluate(cdp: CDPClient, expression: string): Promise<unknown> {
  const { result } = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  }) as { result: { value: unknown } };
  return result.value;
}

async function settle(cdp: CDPClient): Promise<void> {
  await cdp.send("Runtime.evaluate", {
    expression: "new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))",
    awaitPromise: true,
  });
}

async function reloadPage(cdp: CDPClient): Promise<void> {
  const loadPromise = new Promise<void>((resolve) => {
    cdp.onEvent("Page.loadEventFired", () => resolve());
  });
  await cdp.send("Page.reload");
  await loadPromise;
  await settle(cdp);
  await cdp.send("Runtime.evaluate", {
    expression: "new Promise(r => setTimeout(r, 500))",
    awaitPromise: true,
  });
}

async function main() {
  const sv = startServer();

  const chrome = new Deno.Command("chromium-browser", {
    args: [
      `--remote-debugging-port=${PORT + 1}`,
      "--headless=new",
      "--no-first-run",
      "--disable-gpu",
      "--no-sandbox",
    ],
    stdout: "null",
    stderr: "null",
  });
  const proc = chrome.spawn();
  const cdpPort = PORT + 1;

  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${cdpPort}/json/version`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }

  const cdp = await connectCDP(cdpPort);
  await cdp.send("Page.enable");

  // Capture page errors
  const pageErrors: string[] = [];
  cdp.onEvent("Runtime.consoleAPICalled", (params: any) => {
    const args = params.args.map((a: any) => a.value ?? a.description ?? "");
    if (args.some((a: string) => a.includes("error") || a.includes("Error") || a.includes("TypeError"))) {
      pageErrors.push(args.join(" "));
    }
  });
  cdp.onEvent("Runtime.exceptionThrown", (params: any) => {
    pageErrors.push(params.exceptionDetails?.text + " " + (params.exceptionDetails?.exception?.description ?? ""));
  });
  await cdp.send("Runtime.enable");

  // Initial navigation
  const loadPromise = new Promise<void>((resolve) => {
    cdp.onEvent("Page.loadEventFired", () => resolve());
  });
  await cdp.send("Page.navigate", { url: TESTBED });
  await loadPromise;
  await cdp.send("Runtime.evaluate", {
    expression: "new Promise(r => setTimeout(r, 1000))",
    awaitPromise: true,
  });

  try {
    // ── Test 1: initial values ──
    {
      const hp = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('[mf-text="hp"]').textContent`,
      );
      assertEquals(hp, "20", "initial HP");

      const hpMax = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('[mf-text="hpMax"]').textContent`,
      );
      assertEquals(hpMax, "20", "initial HP max");

      const pct = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('.hp-fill').style.width`,
      );
      assertEquals(pct, "100%", "initial HP percent");

      const bloodiedHidden = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('[mf-toggle="bloodied"]').hidden`,
      );
      assertEquals(bloodiedHidden, true, "initial not bloodied");

      console.log("  ✓ initial values");
    }

    // ── Test 2: damage reduces HP and updates percent ──
    {
      await evaluate(cdp, `document.getElementById('btn-damage-5').click()`);
      await settle(cdp);

      const hp = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('[mf-text="hp"]').textContent`,
      );
      assertEquals(hp, "15", "HP after 5 damage");

      const pct = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('.hp-fill').style.width`,
      );
      assertEquals(pct, "75%", "HP percent after damage");

      console.log("  ✓ damage reduces HP");
    }

    // Reload before next test
    await reloadPage(cdp);

    // ── Test 3: bloodied status at half HP ──
    {
      await evaluate(cdp, `document.getElementById('btn-damage-15').click()`);
      await settle(cdp);

      const status = await evaluate(cdp,
        `document.querySelector('status-badge').shadowRoot.querySelector('[mf-text="status"]').textContent`,
      );
      assertEquals(status, "bloodied", "status should be bloodied");

      const bloodiedHidden = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('[mf-toggle="bloodied"]').hidden`,
      );
      assertEquals(bloodiedHidden, false, "BLOODIED tag visible");

      console.log("  ✓ bloodied status");
    }

    // Reload before next test
    await reloadPage(cdp);

    // ── Test 4: heal restores HP and clears bloodied ──
    {
      await evaluate(cdp, `document.getElementById('btn-damage-15').click()`);
      await settle(cdp);
      await evaluate(cdp, `document.getElementById('btn-heal-6').click()`);
      await settle(cdp);

      const hp = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('[mf-text="hp"]').textContent`,
      );
      assertEquals(hp, "11", "HP after damage 15 + heal 6");

      const bloodiedHidden = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('[mf-toggle="bloodied"]').hidden`,
      );
      assertEquals(bloodiedHidden, true, "bloodied tag hidden after heal above half");

      const statusText = await evaluate(cdp,
        `document.querySelector('status-badge').shadowRoot.querySelector('[mf-text="status"]').textContent`,
      );
      assertEquals(statusText, "healthy", "status text restored to healthy after heal");

      console.log("  ✓ heal restores HP");
    }

    // Reload before next test
    await reloadPage(cdp);

    // ── Test 5: temp HP absorbs damage ──
    {
      await evaluate(cdp, `document.getElementById('btn-temp-7').click()`);
      await settle(cdp);

      const tempBefore = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('.temp-hp').textContent`,
      );
      assertEquals(tempBefore, "7", "temp HP 7");

      await evaluate(cdp, `document.getElementById('btn-damage-5').click()`);
      await settle(cdp);

      const hp = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('[mf-text="hp"]').textContent`,
      );
      assertEquals(hp, "20", "HP unchanged after damage absorbed by temp");

      const tempAfter = await evaluate(cdp,
        `document.querySelector('hp-bar').shadowRoot.querySelector('.temp-hp').textContent`,
      );
      assertEquals(tempAfter, "2", "temp HP 2 remaining");

      console.log("  ✓ temp HP absorbs damage");
    }

    if (pageErrors.length > 0) {
      console.log("\n⚠️  Page errors detected:");
      for (const e of pageErrors) console.log("  ", e);
      throw new Error(`E2E test failed: ${pageErrors.length} page error(s) detected`);
    }

    console.log("\n✅ All e2e tests passed!");
  } finally {
    cdp.close();
    proc.kill("SIGKILL");
    try { await proc.status; } catch {}
    await sv.shutdown();
  }
}

if (import.meta.main) {
  await main();
}
