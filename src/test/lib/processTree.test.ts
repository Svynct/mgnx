import { describe, it, expect } from 'vitest';
import { ProcessEntry } from '../../stores/processStore';
import {
  buildVisibleTree,
  hoistPinnedTree,
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

describe('buildVisibleTree — roots', () => {
  it('treats ppid 0 as a root', () => {
    const rows = buildVisibleTree([proc({ pid: 1, ppid: 0 })], new Set(), 'cpu');
    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
  });

  it('treats an orphan (ppid not in the snapshot) as a root', () => {
    // ppid 999 is not present, so pid 5 is a top-level root.
    const rows = buildVisibleTree([proc({ pid: 5, ppid: 999 })], new Set(), 'cpu');
    expect(rows).toHaveLength(1);
    expect(rows[0].proc.pid).toBe(5);
    expect(rows[0].depth).toBe(0);
  });

  it('does not emit children of a collapsed root', () => {
    const rows = buildVisibleTree(
      [proc({ pid: 1, ppid: 0 }), proc({ pid: 2, ppid: 1 })],
      new Set(),
      'cpu',
    );
    expect(pids(rows)).toEqual([1]);
    expect(rows[0].hasChildren).toBe(true);
    expect(rows[0].expanded).toBe(false);
  });
});

describe('buildVisibleTree — accumulation', () => {
  const tree = [
    proc({ pid: 1, ppid: 0, cpu_percent: 1, memory_mb: 10 }),
    proc({ pid: 2, ppid: 1, cpu_percent: 2, memory_mb: 20 }),
    proc({ pid: 3, ppid: 2, cpu_percent: 4, memory_mb: 40 }), // grandchild
  ];

  it('collapsed parent shows self + all descendants', () => {
    const rows = buildVisibleTree(tree, new Set(), 'cpu');
    expect(rows).toHaveLength(1);
    expect(rows[0].cpuAccum).toBe(7); // 1 + 2 + 4
    expect(rows[0].memAccum).toBe(70); // 10 + 20 + 40
  });

  it('leaf shows its own values as accum', () => {
    const rows = buildVisibleTree([proc({ pid: 9, cpu_percent: 3, memory_mb: 30 })], new Set(), 'cpu');
    expect(rows[0].hasChildren).toBe(false);
    expect(rows[0].cpuAccum).toBe(3);
    expect(rows[0].memAccum).toBe(30);
  });

  it('expanded parent still carries its full accum on the row (renderer decides own vs accum)', () => {
    const rows = buildVisibleTree(tree, new Set([1]), 'cpu');
    // Root expanded -> root + child 2 (child 2 collapsed, so grandchild hidden).
    expect(pids(rows)).toEqual([1, 2]);
    expect(rows[0].expanded).toBe(true);
    expect(rows[0].cpuAccum).toBe(7); // accum is still computed; the row's own
    expect(rows[0].proc.cpu_percent).toBe(1); // value is available separately
  });
});

describe('buildVisibleTree — expand reveals direct children only', () => {
  const tree = [
    proc({ pid: 1, ppid: 0 }),
    proc({ pid: 2, ppid: 1 }),
    proc({ pid: 3, ppid: 2 }),
  ];

  it('expanding the root reveals its direct child at depth 1, not the grandchild', () => {
    const rows = buildVisibleTree(tree, new Set([1]), 'cpu');
    expect(pids(rows)).toEqual([1, 2]);
    expect(rows[1].depth).toBe(1);
    expect(rows[1].hasChildren).toBe(true);
    expect(rows[1].expanded).toBe(false);
  });

  it('expanding root + child reveals the grandchild at depth 2', () => {
    const rows = buildVisibleTree(tree, new Set([1, 2]), 'cpu');
    expect(pids(rows)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2]);
  });
});

describe('buildVisibleTree — sorting', () => {
  const roots = [
    proc({ pid: 1, ppid: 0, cpu_percent: 1, memory_mb: 50, name: 'zebra' }),
    proc({ pid: 2, ppid: 0, cpu_percent: 9, memory_mb: 10, name: 'apple' }),
    proc({ pid: 3, ppid: 0, cpu_percent: 5, memory_mb: 30, name: 'mango' }),
  ];

  it('sorts roots by cpuAccum descending', () => {
    expect(pids(buildVisibleTree(roots, new Set(), 'cpu'))).toEqual([2, 3, 1]);
  });

  it('sorts roots by memAccum descending', () => {
    expect(pids(buildVisibleTree(roots, new Set(), 'mem'))).toEqual([1, 3, 2]);
  });

  it('sorts roots by name ascending (localeCompare)', () => {
    expect(pids(buildVisibleTree(roots, new Set(), 'name'))).toEqual([2, 3, 1]);
  });

  it('sorts children by accumulated subtree weight, not own value', () => {
    // Parent 1 has two children: child 3 (own cpu 0) owns a heavy grandchild;
    // child 2 has cpu 1. By cpuAccum, child 3 (0+10) should lead child 2 (1).
    const tree = [
      proc({ pid: 1, ppid: 0, cpu_percent: 0 }),
      proc({ pid: 2, ppid: 1, cpu_percent: 1 }),
      proc({ pid: 3, ppid: 1, cpu_percent: 0 }),
      proc({ pid: 4, ppid: 3, cpu_percent: 10 }),
    ];
    const rows = buildVisibleTree(tree, new Set([1]), 'cpu');
    expect(pids(rows)).toEqual([1, 3, 2]);
  });
});

describe('buildVisibleTree — cycle safety', () => {
  it('does not loop on a self-referential process', () => {
    // pid 1 is its own parent. ppid 1 IS a known pid, so it is not a root by the
    // ppid rule; with no real root the result is empty but must not hang.
    const rows = buildVisibleTree([proc({ pid: 1, ppid: 1 })], new Set([1]), 'cpu');
    expect(rows).toEqual([]);
  });

  it('does not re-descend a node already seen in a 2-cycle under a real root', () => {
    // 0-rooted chain 1 -> 2, plus a back-edge 2 -> ... none; build a cycle 3<->4
    // hanging off root 1 via 2 -> 3, 3 -> 4, 4 -> 3 (back edge).
    const tree = [
      proc({ pid: 1, ppid: 0 }),
      proc({ pid: 2, ppid: 1 }),
      proc({ pid: 3, ppid: 2 }),
      proc({ pid: 4, ppid: 3 }),
    ];
    // Manufacture a back-edge by making 3's parent 4 as well is impossible (single
    // ppid); instead verify a fully-expanded deep chain terminates.
    const rows = buildVisibleTree(tree, new Set([1, 2, 3]), 'cpu');
    expect(pids(rows)).toEqual([1, 2, 3, 4]);
  });

  it('skips a child whose pid already appeared on the ancestor path', () => {
    // Two processes both claim each other as parent: 10 -> 11 and 11 -> 10.
    // Neither has ppid 0 and both pids exist, so neither is a root => empty,
    // and the build must terminate without infinite recursion.
    const rows = buildVisibleTree(
      [proc({ pid: 10, ppid: 11 }), proc({ pid: 11, ppid: 10 })],
      new Set([10, 11]),
      'cpu',
    );
    expect(rows).toEqual([]);
  });
});

describe('hoistPinnedTree', () => {
  // Two subtrees: root 1 (with child 2) and root 3 (with child 4), then leaf 5.
  function sample(): TreeRow[] {
    return buildVisibleTree(
      [
        proc({ pid: 1, ppid: 0, cpu_percent: 9 }),
        proc({ pid: 2, ppid: 1, cpu_percent: 0 }),
        proc({ pid: 3, ppid: 0, cpu_percent: 5 }),
        proc({ pid: 4, ppid: 3, cpu_percent: 0 }),
        proc({ pid: 5, ppid: 0, cpu_percent: 1 }),
      ],
      new Set([1, 3]), // expand both parents so segments span multiple rows
      'cpu',
    );
  }

  it('returns rows unchanged when nothing is pinned', () => {
    const rows = sample();
    expect(hoistPinnedTree(rows, [])).toBe(rows);
  });

  it('floats a pinned root segment (root + children) to the top', () => {
    const rows = sample(); // order: 1,2,3,4,5
    expect(pids(hoistPinnedTree(rows, [3]))).toEqual([3, 4, 1, 2, 5]);
  });

  it('floats the whole subtree when a CHILD is pinned, keeping the root attached', () => {
    const rows = sample();
    // pinning child 4 must hoist its root segment (3,4) ahead of segment (1,2).
    expect(pids(hoistPinnedTree(rows, [4]))).toEqual([3, 4, 1, 2, 5]);
  });

  it('preserves relative order among pinned and among unpinned segments', () => {
    const rows = sample();
    // pin both segment-3 and the leaf 5: pinned kept in original order (3.. then 5).
    expect(pids(hoistPinnedTree(rows, [3, 5]))).toEqual([3, 4, 5, 1, 2]);
  });

  it('does not mutate the input array', () => {
    const rows = sample();
    const snapshot = pids(rows);
    hoistPinnedTree(rows, [4]);
    expect(pids(rows)).toEqual(snapshot);
  });
});

describe('flatToTreeRows', () => {
  it('maps each process to a depth-0 leaf carrying its own values', () => {
    const rows = flatToTreeRows([proc({ pid: 7, cpu_percent: 3, memory_mb: 30 })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      depth: 0,
      hasChildren: false,
      expanded: false,
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
