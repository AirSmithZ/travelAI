import { useSyncExternalStore } from 'react';
import type { CostQuote, Doc, LayoutLock, PanelId, SaveNodeInput, Scope, UiState } from './types';
import { applyDelete, applyExtras, applySave, applyTravelers, clampDayIndex, seedDoc } from './trip';

const DOC_KEY = 'anz-mobile-doc-v1';
const UI_KEY = 'anz-mobile-ui-v1';

const defaultUi = (): UiState => ({
  scope: 'day',
  dayIndex: 0,
  panel: 'graph',
  selectedId: null,
  layoutLock: 'auto',
  editor: null,
});

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function docLooksValid(value: Doc | null): value is Doc {
  return Boolean(value && value.itinerary && Array.isArray(value.itinerary.days) && value.itinerary.days.length > 0);
}

function loadDoc(): { doc: Doc; storageOk: boolean } {
  const stored = readJson<Doc>(DOC_KEY);
  if (docLooksValid(stored)) return { doc: stored, storageOk: true };
  const doc = seedDoc();
  const storageOk = writeJson(DOC_KEY, doc);
  return { doc, storageOk };
}

function loadUi(doc: Doc): UiState {
  const stored = readJson<Partial<UiState>>(UI_KEY);
  const base = defaultUi();
  if (!stored) return base;
  const panel: PanelId = stored.panel === 'map' || stored.panel === 'cost' || stored.panel === 'graph' ? stored.panel : 'graph';
  const scope: Scope = stored.scope === 'all' ? 'all' : 'day';
  const layoutLock: LayoutLock =
    stored.layoutLock === 'portrait' || stored.layoutLock === 'landscape' || stored.layoutLock === 'auto'
      ? stored.layoutLock
      : 'auto';
  return {
    ...base,
    panel,
    scope,
    layoutLock,
    dayIndex: clampDayIndex(doc, typeof stored.dayIndex === 'number' ? stored.dayIndex : 0),
    selectedId: typeof stored.selectedId === 'string' ? stored.selectedId : null,
    editor: null,
  };
}

const loaded = loadDoc();
let doc = loaded.doc;
let ui = loadUi(doc);
let storageOk = loaded.storageOk;
let snapshot = { doc, ui, storageOk };

const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { doc, ui, storageOk };
  listeners.forEach((listener) => listener());
}

function commitDoc(next: Doc): void {
  doc = next;
  storageOk = writeJson(DOC_KEY, doc);
  writeJson(UI_KEY, ui);
  emit();
}

function commitUi(next: UiState): void {
  ui = next;
  if (!writeJson(UI_KEY, ui)) storageOk = false;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function useTrip() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const actions = {
  setPanel(panel: PanelId) {
    commitUi({ ...ui, panel });
  },
  setScope(scope: Scope) {
    commitUi({ ...ui, scope });
  },
  setDay(dayIndex: number) {
    if (ui.editor) return;
    commitUi({ ...ui, dayIndex: clampDayIndex(doc, dayIndex), scope: 'day' });
  },
  pickOverviewDay(dayIndex: number) {
    if (ui.editor) return;
    commitUi({ ...ui, dayIndex: clampDayIndex(doc, dayIndex) });
  },
  selectNode(nodeId: string | null) {
    if (ui.editor) return;
    const found = nodeId
      ? doc.itinerary.days.findIndex((day) => day.nodes.some((node) => node.id === nodeId))
      : -1;
    commitUi({
      ...ui,
      selectedId: nodeId,
      editor: null,
      dayIndex: found >= 0 ? found : ui.dayIndex,
    });
  },
  setLayoutLock(layoutLock: LayoutLock) {
    commitUi({ ...ui, layoutLock });
  },
  beginCreate() {
    if (ui.editor) return;
    const dayIndex = clampDayIndex(doc, ui.dayIndex);
    commitUi({
      ...ui,
      dayIndex,
      editor: {
        token: Date.now(),
        mode: 'create',
        dayIndex,
        nodeId: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      },
    });
  },
  closeDetail() {
    commitUi({ ...ui, editor: null, selectedId: null });
  },
  beginEdit(nodeId: string) {
    const found = doc.itinerary.days.findIndex((day) => day.nodes.some((node) => node.id === nodeId));
    if (found < 0) return;
    commitUi({
      ...ui,
      dayIndex: found,
      selectedId: nodeId,
      editor: { token: Date.now(), mode: 'edit', dayIndex: found, nodeId },
    });
  },
  cancelEditor() {
    commitUi({ ...ui, editor: null });
  },
  saveNode(input: SaveNodeInput) {
    doc = applySave(doc, input);
    storageOk = writeJson(DOC_KEY, doc);
    ui = {
      ...ui,
      editor: null,
      selectedId: input.node.id,
      dayIndex: input.dayIndex,
    };
    writeJson(UI_KEY, ui);
    emit();
  },
  deleteNode(nodeId: string) {
    doc = applyDelete(doc, nodeId);
    storageOk = writeJson(DOC_KEY, doc);
    ui = {
      ...ui,
      editor: ui.editor?.nodeId === nodeId ? null : ui.editor,
      selectedId: ui.selectedId === nodeId ? null : ui.selectedId,
    };
    writeJson(UI_KEY, ui);
    emit();
  },
  setTravelers(travelers: number) {
    commitDoc(applyTravelers(doc, travelers));
  },
  setExtras(extras: CostQuote[]) {
    commitDoc(applyExtras(doc, extras));
  },
  resetSeed() {
    doc = seedDoc();
    storageOk = writeJson(DOC_KEY, doc);
    ui = { ...defaultUi(), layoutLock: ui.layoutLock };
    writeJson(UI_KEY, ui);
    emit();
  },
};
