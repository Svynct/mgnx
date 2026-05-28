import { describe, it, expect } from 'vitest';
import { ProcessEntry } from '../../stores/processStore';
import {
  buildVisibleTree,
  ancestorChain,
  ancestorPids,
  flatToTreeRows,
  TreeRow,
} from '../../lib/processTree';

// Builds a ProcessEntry with sane defaults; only the fields a test cares about
// need to be passed.
function proc(over: Partial<ProcessEntry> & { pid: number }): ProcessEntry {
  return {
    ppid: 0,
    name: `p${over.pid}`,
    cpu_percent: 0,
    memory_mb: 0,
    status: 'R',
    user: 'u',
    threads: 1,
    ...over,
  };
}

const pids = (rows: TreeRow[]) => rows.map((r) => r.proc.pid);
// Empty toggle set = pure depth default: roots open one level, deeper folded.
const DEFAULT = new Set<number>();
const NO_PINS = new Set<number>();

describe('buildVisibleTree — depth default', () => {
  it('treats ppid 0 as a root', () => {
    const rows = buildVisibleTree([proc({ pid: 1, ppid: 0 })], DEFAULT, 'cpu', NO_PINS);
    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
  });

  it('treats an orphan (ppid not in the snapshot) as a root', () => {
    const rows = buildVisibleTree([proc({ pid: 5, ppid: 999 })], DEFAULT, 'cpu', NO_PINS);
    expect(pids(rows)).toEqual([5]);
  });

  it('opens roots one level by default (direct children shown, folded)', () => {
    const tree = [proc({ pid: 1, ppid: 0 }), proc({ pid: 2, ppid: 1 }), proc({ pid: 3, ppid: 2 })];
    const rows = buildVisibleTree(tree, DEFAULT, 'cpu', NO_PINS);
    expect(pids(rows)).toEqual([1, 2]); // grandchild 3 hidden under folded child 2
    expect(rows[0].expanded).toBe(true);  // root open
    expect(rows[1].expanded).toBe(false); // depth-1 child folded
  });

  it('folding a root (toggled) hides its children', () => {
    const tree = [proc({ pid: 1, ppid: 0 }), proc({ pid: 2, ppid: 1 })];
    const rows = buildVisibleTree(tree, new Set([1]), 'cpu', NO_PINS);
    expect(pids(rows)).toEqual([1]);
    expect(rows[0].expanded).toBe(false);
  });

  it('toggling a depth-1 node opens it one more level', () => {
    const tree = [proc({ pid: 1, ppid: 0 }), proc({ pid: 2, ppid: 1 }), proc({ pid: 3, ppid: 2 })];
    const rows = buildVisibleTree(tree, new Set([2]), 'cpu', NO_PINS);
    expect(pids(rows)).toEqual([1, 2, 3]); // 2 opened -> grandchild 3 revealed (folded)
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2]);
  });
});

describe('buildVisibleTree — accumulation (path-sum)', () => {
  const tree = [
    proc({ pid: 1, ppid: 0, cpu_percent: 1, memory_mb: 10 }),
    proc({ pid: 2, ppid: 1, cpu_percent: 2, memory_mb: 20 }),
    proc({ pid: 3, ppid: 2, cpu_percent: 4, memory_mb: 40 }), // grandchild
  ];

  it('rolls every descendant into the root total', () => {
    const rows = buildVisibleTree(tree, new Set([1]), 'cpu', NO_PINS); // fold root
    expect(rows[0].cpuAccum).toBe(7); // 1 + 2 + 4
    expect(rows[0].memAccum).toBe(70); // 10 + 20 + 40
  });

  it('a leaf accum is just its own usage', () => {
    const rows = buildVisibleTree([proc({ pid: 9, cpu_percent: 3, memory_mb: 30 })], DEFAULT, 'cpu', NO_PINS);
    expect(rows[0].cpuAccum).toBe(3);
    expect(rows[0].memAccum).toBe(30);
  });

  it('a mid node sums itself plus its subtree', () => {
    // Fully open: 1 -> 2 -> 3. Node 2 accum = 2 + 4 = 6.
    const rows = buildVisibleTree(tree, new Set([2]), 'cpu', NO_PINS);
    expect(rows.find((r) => r.proc.pid === 2)!.cpuAccum).toBe(6);
  });
});

describe('buildVisibleTree — sorting', () => {
  const roots = [
    proc({ pid: 1, ppid: 0, cpu_percent: 1, memory_mb: 50, name: 'zebra' }),
    proc({ pid: 2, ppid: 0, cpu_percent: 9, memory_mb: 10, name: 'apple' }),
    proc({ pid: 3, ppid: 0, cpu_percent: 5, memory_mb: 30, name: 'mango' }),
  ];

  it('sorts roots by cpuAccum descending', () => {
    expect(pids(buildVisibleTree(roots, DEFAULT, 'cpu', NO_PINS))).toEqual([2, 3, 1]);
  });

  it('sorts roots by memAccum descending', () => {
    expect(pids(buildVisibleTree(roots, DEFAULT, 'mem', NO_PINS))).toEqual([1, 3, 2]);
  });

  it('sorts roots by name ascending (localeCompare)', () => {
    expect(pids(buildVisibleTree(roots, DEFAULT, 'name', NO_PINS))).toEqual([2, 3, 1]);
  });

  it('sorts children by accumulated subtree weight', () => {
    const tree = [
      proc({ pid: 1, ppid: 0, cpu_percent: 0 }),
      proc({ pid: 2, ppid: 1, cpu_percent: 1 }),
      proc({ pid: 3, ppid: 1, cpu_percent: 0 }),
      proc({ pid: 4, ppid: 3, cpu_percent: 10 }),
    ];
    // Child 3's subtree (0 + 10) outweighs child 2 (1), so 3 leads 2.
    const rows = buildVisibleTree(tree, DEFAULT, 'cpu', NO_PINS);
    expect(pids(rows)).toEqual([1, 3, 2]);
  });
});

describe('buildVisibleTree — pinned hoisting', () => {
  it('floats a pinned root above its siblings regardless of sort', () => {
    const roots = [
      proc({ pid: 1, ppid: 0, cpu_percent: 1 }),
      proc({ pid: 2, ppid: 0, cpu_percent: 9 }),
      proc({ pid: 3, ppid: 0, cpu_percent: 5 }),
    ];
    expect(pids(buildVisibleTree(roots, DEFAULT, 'cpu', new Set([1])))).toEqual([1, 2, 3]);
    expect(buildVisibleTree(roots, DEFAULT, 'cpu', new Set([1]))[0].pinned).toBe(true);
  });

  it('floats the pinned node to the top of its level (child under an open root)', () => {
    const tree = [
      proc({ pid: 1, ppid: 0 }),
      proc({ pid: 2, ppid: 1, cpu_percent: 1 }),
      proc({ pid: 3, ppid: 1, cpu_percent: 5 }),
    ];
    const pinned = ancestorPids(tree, 2); // {1, 2}
    const rows = buildVisibleTree(tree, DEFAULT, 'cpu', pinned);
    expect(pids(rows)).toEqual([1, 2, 3]); // 2 hoisted above 3 despite lower cpu
    expect(rows.find((r) => r.proc.pid === 2)!.pinned).toBe(true);
    expect(rows.find((r) => r.proc.pid === 3)!.pinned).toBe(false);
  });
});

describe('buildVisibleTree — cycle safety', () => {
  it('does not loop on a self-referential process', () => {
    const rows = buildVisibleTree([proc({ pid: 1, ppid: 1 })], DEFAULT, 'cpu', NO_PINS);
    expect(rows).toEqual([]);
  });

  it('terminates on a deep chain opened all the way', () => {
    const tree = [
      proc({ pid: 1, ppid: 0 }),
      proc({ pid: 2, ppid: 1 }),
      proc({ pid: 3, ppid: 2 }),
      proc({ pid: 4, ppid: 3 }),
    ];
    const rows = buildVisibleTree(tree, new Set([2, 3]), 'cpu', NO_PINS);
    expect(pids(rows)).toEqual([1, 2, 3, 4]);
  });

  it('skips a child whose pid already appeared on the ancestor path', () => {
    const rows = buildVisibleTree(
      [proc({ pid: 10, ppid: 11 }), proc({ pid: 11, ppid: 10 })],
      DEFAULT,
      'cpu',
      NO_PINS,
    );
    expect(rows).toEqual([]);
  });
});

describe('ancestorChain / ancestorPids', () => {
  const chain = [proc({ pid: 1, ppid: 0 }), proc({ pid: 2, ppid: 1 }), proc({ pid: 3, ppid: 2 })];

  it('returns the ordered path leaf -> root', () => {
    expect(ancestorChain(chain, 3)).toEqual([3, 2, 1]);
  });

  it('returns just the pid for a root', () => {
    expect(ancestorChain(chain, 1)).toEqual([1]);
  });

  it('returns empty for a pid not in the snapshot', () => {
    expect(ancestorChain(chain, 99)).toEqual([]);
  });

  it('terminates on a cycle', () => {
    const cyclic = [proc({ pid: 10, ppid: 11 }), proc({ pid: 11, ppid: 10 })];
    expect(ancestorChain(cyclic, 10)).toEqual([10, 11]);
  });

  it('ancestorPids returns the chain as a set', () => {
    expect([...ancestorPids(chain, 3)].sort()).toEqual([1, 2, 3]);
  });
});

describe('flatToTreeRows', () => {
  it('maps each process to a depth-0 leaf with own usage as accum', () => {
    const rows = flatToTreeRows([proc({ pid: 7, cpu_percent: 3, memory_mb: 30 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      depth: 0,
      hasChildren: false,
      expanded: false,
      pinned: false,
      cpuAccum: 3,
      memAccum: 30,
    });
    expect(rows[0].proc.pid).toBe(7);
  });

  it('preserves input order', () => {
    const rows = flatToTreeRows([proc({ pid: 3 }), proc({ pid: 1 }), proc({ pid: 2 })]);
    expect(pids(rows)).toEqual([3, 1, 2]);
  });
});
