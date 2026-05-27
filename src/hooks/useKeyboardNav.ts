import { useState, useCallback } from 'react';
import { TabName } from '../components/TabBar';

export type Zone = 'tabs' | 'filters' | 'content' | 'actions';

function availableZones(tab: TabName, hasSelection: boolean): Zone[] {
  if (tab !== 'processes') return ['tabs'];
  const zones: Zone[] = ['tabs', 'filters', 'content'];
  if (hasSelection) zones.push('actions');
  return zones;
}

interface KeyboardNavState {
  zone: Zone;
  tabIdx: number;
  rowIdx: number;
  filterIdx: number;
  actionIdx: number;
  handleKey: (e: KeyboardEvent) => void;
}

const TAB_NAMES: TabName[] = ['processes', 'resources', 'network', 'disk', 'gpu'];

interface Options {
  rowCount: number;
  filterCount: number;
  actionCount: number;
  onTabChange: (t: TabName) => void;
  onRowSelect: (idx: number) => void;
  onRowDeselect: () => void;
  onActionActivate: (idx: number) => void;
  onFilterActivate: (idx: number) => void;
}

export function useKeyboardNav(
  activeTab: TabName,
  hasSelection: boolean,
  opts: Options = {
    rowCount: 0, filterCount: 4, actionCount: 6,
    onTabChange: () => {}, onRowSelect: () => {},
    onRowDeselect: () => {}, onActionActivate: () => {},
    onFilterActivate: () => {},
  }
): KeyboardNavState {
  const [zone, setZone] = useState<Zone>('tabs');
  const [tabIdx, setTabIdx] = useState(TAB_NAMES.indexOf(activeTab));
  const [rowIdx, setRowIdx] = useState(0);
  const [filterIdx, setFilterIdx] = useState(0);
  const [actionIdx, setActionIdx] = useState(0);

  const handleKey = useCallback((e: KeyboardEvent) => {
    const zones = availableZones(activeTab, hasSelection);

    if (e.key === 'Tab') {
      e.preventDefault();
      if (zones.length <= 1) return;
      const cur = zones.indexOf(zone);
      const next = (cur + (e.shiftKey ? zones.length - 1 : 1)) % zones.length;
      const nextZone = zones[next];
      setZone(nextZone);
      if (nextZone === 'filters') setFilterIdx(0);
      if (nextZone === 'actions') setActionIdx(0);
      return;
    }

    if (zone === 'tabs') {
      if (e.key === 'ArrowRight') {
        const next = (tabIdx + 1) % TAB_NAMES.length;
        setTabIdx(next);
        opts.onTabChange(TAB_NAMES[next]);
      } else if (e.key === 'ArrowLeft') {
        const next = (tabIdx - 1 + TAB_NAMES.length) % TAB_NAMES.length;
        setTabIdx(next);
        opts.onTabChange(TAB_NAMES[next]);
      }
      return;
    }

    if (zone === 'filters') {
      if (e.key === 'ArrowRight') setFilterIdx((i) => (i + 1) % opts.filterCount);
      if (e.key === 'ArrowLeft')  setFilterIdx((i) => (i - 1 + opts.filterCount) % opts.filterCount);
      if (e.key === 'Enter') opts.onFilterActivate(filterIdx);
      if (e.key === 'Escape') setZone('tabs');
      return;
    }

    if (zone === 'content') {
      if (e.key === 'ArrowDown')  setRowIdx((i) => Math.min(i + 1, opts.rowCount - 1));
      if (e.key === 'ArrowUp')    setRowIdx((i) => Math.max(i - 1, 0));
      if (e.key === 'Enter') opts.onRowSelect(rowIdx);
      if (e.key === 'Escape') opts.onRowDeselect();
      return;
    }

    if (zone === 'actions') {
      if (e.key === 'ArrowRight') setActionIdx((i) => (i + 1) % opts.actionCount);
      if (e.key === 'ArrowLeft')  setActionIdx((i) => (i - 1 + opts.actionCount) % opts.actionCount);
      if (e.key === 'Enter') opts.onActionActivate(actionIdx);
      if (e.key === 'Escape') setZone('content');
      return;
    }
  }, [zone, tabIdx, rowIdx, filterIdx, actionIdx, activeTab, hasSelection, opts]);

  return { zone, tabIdx, rowIdx, filterIdx, actionIdx, handleKey };
}
