import type { SubscriberRegistration, PriorityHint } from "./types.ts";

export type Graph = Map<string, string[]>;

export type OrderingResult = {
  order: string[];
  cycle?: string[];
};

export function resolveOrdering(
  subscribers: SubscriberRegistration<any>[],
): OrderingResult {
  const vertices = new Set(subscribers.map((s) => s.id));
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of vertices) {
    adjacency.set(id, []);
    inDegree.set(id, 0);
  }

  for (const sub of subscribers) {
    for (const target of sub.before) {
      if (vertices.has(target)) {
        adjacency.get(sub.id)!.push(target);
        inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
      }
    }
    for (const target of sub.after) {
      if (vertices.has(target)) {
        adjacency.get(target)!.push(sub.id);
        inDegree.set(sub.id, (inDegree.get(sub.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  if (queue.length === 0 && vertices.size > 0) {
    return { order: [], cycle: detectCycle(adjacency, vertices) };
  }

  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);

    for (const neighbor of adjacency.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (order.length !== vertices.size) {
    const remaining = new Set(vertices);
    for (const id of order) remaining.delete(id);
    return {
      order,
      cycle: detectCycle(adjacency, remaining),
    };
  }

  // Apply priority hints within topological layers
  return { order: applyPriorities(order, subscribers, adjacency) };
}

function detectCycle(
  adjacency: Map<string, string[]>,
  vertices: Set<string>,
): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const v of vertices) color.set(v, WHITE);

  let cycle: string[] = [];

  function dfs(node: string): boolean {
    color.set(node, GRAY);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!vertices.has(neighbor)) continue;
      if (color.get(neighbor) === GRAY) {
        // Found cycle, reconstruct
        let cur: string | null = node;
        const path = [neighbor, node];
        while (cur !== neighbor && cur !== null) {
          cur = parent.get(cur) ?? null;
          if (cur) path.push(cur);
        }
        cycle = path.reverse();
        return true;
      }
      if (color.get(neighbor) === WHITE) {
        parent.set(neighbor, node);
        if (dfs(neighbor)) return true;
      }
    }
    color.set(node, BLACK);
    return false;
  }

  for (const v of vertices) {
    if (color.get(v) === WHITE) {
      parent.set(v, null);
      if (dfs(v)) return cycle;
    }
  }

  return [];
}

function applyPriorities(
  order: string[],
  subscribers: SubscriberRegistration<any>[],
  adjacency: Graph,
): string[] {
  const subMap = new Map<string, SubscriberRegistration<any>>();
  for (const sub of subscribers) subMap.set(sub.id, sub);

  // Partition into layers by topological depth
  const depth = new Map<string, number>();
  for (const id of order) {
    let maxDepth = 0;
    for (const [from, toList] of adjacency) {
      if (toList.includes(id)) {
        maxDepth = Math.max(maxDepth, (depth.get(from) ?? 0) + 1);
      }
    }
    depth.set(id, maxDepth);
  }

  const layers = new Map<number, string[]>();
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    if (!layers.has(d)) layers.set(d, []);
    layers.get(d)!.push(id);
  }

  const result: string[] = [];
  for (let d = 0; d < layers.size; d++) {
    const layer = layers.get(d) ?? [];
    const sorted = [...layer].sort((a, b) => {
      const pa = subMap.get(a)?.priority;
      const pb = subMap.get(b)?.priority;
      const score = (p: PriorityHint | undefined) =>
        p === "early" ? 0 : p === "late" ? 2 : 1;
      return score(pa) - score(pb);
    });
    result.push(...sorted);
  }

  return result;
}

export function visualizeGraph(
  subscribers: SubscriberRegistration<any>[],
): Graph {
  const graph = new Map<string, string[]>();
  for (const sub of subscribers) {
    graph.set(sub.id, [...sub.before, ...sub.after.map((a) => `←${a}`)]);
  }
  return graph;
}
