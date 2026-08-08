import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Itinerary, ItineraryNode, GraphViewMode, ViewTab, DayPlan, DayWeather } from '../types/itinerary';
import type { FormPatch, TravelPlan, ChatMode } from '../types/travelPlan';
import type { TripRequest } from '../types/tripRequest';
import type { FlightLegRole, FlightSearchSession, ManualFlightLegInput } from '../types/travelIntel';
import {
  flightLegsFromQuote,
  flightLegFromManualInput,
  renumberFlightSequences,
  syncFlightSearchAfterLegRemoval,
  syncTravelIntelStatus,
} from '../types/travelIntel';
import { isRoundTripQuote } from '../types/flight';
import { applyFormPatches } from '../utils/formPatchTool';
import {
  createEmptyPlan,
  planTitleFromRequest,
  shouldAutoGenerateItinerary,
  syncItineraryMeta,
  touchPlan,
  tripRequestDatesPatch,
} from '../utils/planHelpers';
import { buildMockItinerary } from '../utils/mockItinerary';
import { addNodeToItinerary, addDayToItinerary, removeNodeFromItinerary, type CreateDayOptions, type NodeInsertOptions } from '../utils/itineraryMutations';
import {
  permuteOverviewColumnWidths,
  removeDayFromItinerary,
  removeOverviewColumnWidth,
  reorderItineraryDaysByDate,
  spliceOverviewColumnWidth,
} from '../utils/dayOrderMutations';
import {
  addRegionToItinerary,
  regionExists,
  renameRegionInItinerary,
  syncDayRegionToNodes,
} from '../utils/regionMutations';
import {
  countOtherDaysWithDate,
  isDayDateOrderInconsistent,
  weekdayFromDate,
} from '../utils/dateUtils';
import { weatherIconLabel } from '../utils/formatWeather';
import {
  connectNodesInItinerary,
  findEdgeContext,
  makeEdgeId,
  removeCrossDayEdgeFromItinerary,
  removeEdgeFromItinerary,
  updateCrossDayEdgeInItinerary,
  updateEdgeInItinerary,
  type EdgeContext,
} from '../utils/edgeMutations';
import type { ItineraryEdge } from '../types/itinerary';
import { generateItineraryStream, geocodeItineraryNodesStream } from '../api/itinerary';
import { syncMessagesAfterPatchAction, tagLastAssistantPatches } from '../utils/chatHelpers';
import { getInitialState, savePlansToStorage } from '../utils/storage';
import { useToastStore } from './useToastStore';
import {
  type ItineraryHistoryStacks,
  popItineraryRedo,
  popItineraryUndo,
  pushItineraryHistory,
} from '../utils/itineraryHistory';
import type { ChatActivitySession } from '../types/chatActivity';
import {
  createGenerateActivity,
  formatActivitySummary,
  patchActivityStep,
} from '../types/chatActivity';
import type { RecommendedStayZone, StayZonePreferences } from '../types/stayZone';
import { addHotelNodeForZone } from '../utils/hotelNodeMutations';
import { findCrossDayPoiDuplicates } from '../utils/crossDayPoiDedup';
import {
  hotelFromZoneAndNode,
  patchStayZones,
  removeHotelByNodeId,
  removeHotelFromIntel,
  syncIntelHotelFromNode,
} from '../utils/hotelIntelSync';

export type GenerationPhase = 'idle' | 'llm' | 'geocode' | 'evidence';

export interface GenerationProgress {
  phase: GenerationPhase;
  llmLatencyMs?: number | null;
  /** generate 流式：从部分 JSON 提取的 title / day label 预览 */
  llmPreview?: string;
  geocodeDone?: number;
  geocodeTotal?: number;
  evidenceCount?: number;
}

const idleProgress: GenerationProgress = { phase: 'idle' };

/** UX-CHAT-03: ephemeral undo after low-risk auto-apply (not persisted) */
export interface PatchUndoSnapshot {
  trip_request: TripRequest;
  itinerary: Itinerary | null;
  appliedIds: string[];
  count: number;
  expiresAt: number;
}

export type EditorTarget =
  | { kind: 'form'; focus: 'day'; dayIndex: number }
  | { kind: 'form'; focus: 'region'; regionName: string };

export type LeftPanelMode = 'chat' | 'flight' | 'stay' | 'form' | 'evidence';

export interface AddHotelFromZoneInput {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  coord_source?: string;
  pendingMapPick?: boolean;
}

interface PlanState {
  plans: TravelPlan[];
  activePlanId: string;
  activeDayIndex: number;
  activeView: ViewTab;
  graphViewMode: GraphViewMode;
  /** 总览 DayChips 触发横向滚动 */
  overviewScrollDay: number | null;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  /** 表头 / 区域轨编辑目标（与 node/edge 互斥） */
  editorTarget: EditorTarget | null;
  leftPanelMode: LeftPanelMode;
  /** UX-14：无 itinerary 时用户手动展开右侧预览 */
  previewExpandedWithoutItinerary: boolean;
  /** 地图选点校准目标节点（§3.6 方式 B） */
  mapPickNodeId: string | null;
  /** 住宿片区卡片 hover / 选中，驱动地图高亮 */
  selectedStayZoneId: string | null;
  /** 总览导出时临时渲染全部列 */
  exportOverviewCapture: boolean;
  /** 总览列宽（按 planId），用户拖拽表头调整 */
  overviewColumnWidths: Record<string, number[]>;
  isGeneratingItinerary: boolean;
  isGeocodingItinerary: boolean;
  generationProgress: GenerationProgress;
  /** UX-CHAT-05: ephemeral activity; not persisted */
  chatActivity: ChatActivitySession | null;
  /** UX-CHAT-03: undo window after auto-applied low-risk patches */
  patchUndoSnapshot: PatchUndoSnapshot | null;
  /** UX-CHAT-02/09: ChatPanel opens readiness checklist when true */
  pendingReadinessPrompt: boolean;

  /** 按 planId 隔离的行程撤销栈（不持久化） */
  itineraryHistories: Record<string, ItineraryHistoryStacks>;

  getActivePlan: () => TravelPlan;
  getItinerary: () => Itinerary | null;

  createPlan: () => void;
  switchPlan: (id: string) => void;
  deletePlan: (id: string) => void;
  renamePlan: (id: string, title: string) => void;
  confirmPatch: (patch: FormPatch) => void;
  confirmPatches: (patches: FormPatch[]) => void;
  dismissPatch: (patchId: string) => void;
  dismissPatches: (patchIds: string[]) => void;

  updateTripRequest: (partial: Partial<TripRequest>) => void;
  setItinerary: (itinerary: Itinerary | null) => void;
  generateItinerary: (
    mode?: import('../api/itinerary').GenerateMode,
  ) => Promise<'api' | 'mock' | 'blocked'>;
  maybeAutoGenerateItinerary: () => Promise<'api' | 'mock' | 'skipped' | 'blocked'>;
  setFlightSearchResult: (session: FlightSearchSession) => void;
  mergeFlightSearchResult: (patch: Partial<FlightSearchSession>) => void;
  confirmFlightQuote: (quoteId: string, role?: FlightLegRole) => void;
  addManualFlightLeg: (input: ManualFlightLegInput) => void;
  removeFlightLeg: (legId: string) => void;
  recommendStayZones: (zones: RecommendedStayZone[], fetchedAt: string) => void;
  setStayZonePreferences: (prefs: StayZonePreferences) => void;
  confirmStayZone: (zoneId: string) => void;
  rejectStayZone: (zoneId: string) => void;
  addHotelFromZone: (zoneId: string, input: AddHotelFromZoneInput) => string | null;
  removeHotelStay: (hotelId: string) => void;
  setSelectedStayZoneId: (zoneId: string | null) => void;
  generateMockItinerary: () => void;
  updateNode: (dayIndex: number, nodeId: string, partial: Partial<ItineraryNode>) => void;
  updateDay: (dayIndex: number, partial: Partial<DayPlan>) => void;
  setDayRegion: (dayIndex: number, region: string) => void;
  setDayDate: (dayIndex: number, date: string) => void;
  updateDayWeather: (dayIndex: number, partial: Partial<DayWeather>) => void;
  updateNodePosition: (dayIndex: number, nodeId: string, position: { x: number; y: number }) => void;
  updateNodeOverviewOffset: (
    dayIndex: number,
    nodeId: string,
    offset: { x: number; y: number },
  ) => void;
  recordItineraryHistory: () => void;
  undoItinerary: () => boolean;
  redoItinerary: () => boolean;
  canUndoItinerary: () => boolean;
  canRedoItinerary: () => boolean;
  addNode: (dayIndex: number, options?: NodeInsertOptions) => void;
  removeNode: (dayIndex: number, nodeId: string) => void;

  connectNodes: (dayIndex: number, from: string, to: string, partial?: Partial<ItineraryEdge>) => void;
  updateEdge: (dayIndex: number, edgeId: string, patch: Partial<ItineraryEdge>) => void;
  updateCrossDayEdge: (edgeId: string, patch: Partial<ItineraryEdge>) => void;
  removeEdge: (dayIndex: number, edgeId: string) => void;
  removeCrossDayEdge: (edgeId: string) => void;

  setLeftPanelMode: (mode: LeftPanelMode) => void;
  setPreviewExpandedWithoutItinerary: (expanded: boolean) => void;
  setChatActivity: (activity: ChatActivitySession | null) => void;
  updateChatActivity: (updater: (prev: ChatActivitySession) => ChatActivitySession) => void;
  setPatchUndoSnapshot: (snapshot: PatchUndoSnapshot | null) => void;
  clearPatchUndoSnapshot: () => void;
  undoLastAutoPatches: () => boolean;
  requestReadinessPrompt: () => void;
  consumeReadinessPrompt: () => void;

  addChatMessage: (
    role: 'user' | 'assistant',
    content: string,
    options?: {
      chat_mode?: ChatMode;
      patches?: FormPatch[];
      patch_status?: 'pending' | 'applied' | 'rejected';
    },
  ) => void;
  addPendingPatches: (patches: FormPatch[]) => void;
  setLastChatMode: (mode: ChatMode) => void;

  setActiveDay: (index: number) => void;
  setActiveView: (view: ViewTab) => void;
  setGraphViewMode: (mode: GraphViewMode) => void;
  scrollOverviewToDay: (dayIndex: number) => void;
  clearOverviewScrollDay: () => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  selectDay: (dayIndex: number) => void;
  selectRegion: (name: string) => void;
  renameRegion: (oldName: string, newName: string) => void;
  addRegion: (name: string, dayIndex?: number) => boolean;
  addDay: (options?: CreateDayOptions) => number;
  insertDayAfter: (dayIndex: number) => number;
  removeDay: (dayIndex: number) => boolean;
  sortDaysByDate: () => void;

  startMapPick: (nodeId: string) => void;
  cancelMapPick: () => void;
  setExportOverviewCapture: (value: boolean) => void;
  setOverviewColumnWidth: (dayIndex: number, width: number) => void;
}

/** 直接读 plans，供 usePlanStore 订阅 itinerary 变更（勿用 getItinerary()） */
export function selectActivePlan(state: PlanState): TravelPlan {
  return state.plans.find((p) => p.id === state.activePlanId) ?? state.plans[0];
}

export function selectActiveItinerary(state: PlanState): Itinerary | null {
  return selectActivePlan(state).itinerary;
}

const EMPTY_OVERVIEW_COLUMN_WIDTHS: number[] = [];

export function selectOverviewColumnWidths(state: PlanState): number[] {
  return state.overviewColumnWidths[state.activePlanId] ?? EMPTY_OVERVIEW_COLUMN_WIDTHS;
}

/** 总览 / 地图浏览时折叠左栏；编辑/选点/机酒/Activity 时展开（UX-CHAT-08） */
export function selectLeftPanelCollapsed(state: PlanState): boolean {
  if (state.editorTarget) return false;
  if (state.mapPickNodeId) return false;
  if (state.chatActivity) return false;
  if (state.leftPanelMode === 'flight' || state.leftPanelMode === 'stay') return false;
  if (state.graphViewMode === 'overview') return true;
  if (state.activeView === 'map') return true;
  return false;
}

/** UX-14：无路线图时折叠右侧预览；有 itinerary 或用户手动展开时展开 */
export function selectPreviewCollapsed(state: PlanState): boolean {
  const itinerary = selectActiveItinerary(state);
  const hasItinerary = Boolean(itinerary?.days?.length);
  if (hasItinerary) return false;
  if (state.previewExpandedWithoutItinerary) return false;
  return true;
}

function settleChatActivity(
  get: () => PlanState,
  set: (partial: Partial<PlanState> | ((s: PlanState) => Partial<PlanState>)) => void,
  error?: string,
) {
  const session = get().chatActivity;
  if (!session) return;
  let next: ChatActivitySession = error ? { ...session, error } : session;
  next = {
    ...next,
    steps: next.steps.map((step) => {
      if (step.status === 'pending' || step.status === 'running') {
        return { ...step, status: error ? ('error' as const) : ('skipped' as const) };
      }
      return step;
    }),
  };
  const content = formatActivitySummary(next, Date.now() - next.startedAt);
  get().addChatMessage('assistant', content);
  set({ chatActivity: null });
}

function runBackgroundGeocode(
  set: (partial: Partial<PlanState> | ((s: PlanState) => Partial<PlanState>)) => void,
  get: () => PlanState,
  itinerary: Itinerary,
  destination: string,
  llmLatencyMs?: number | null,
) {
  const dest = destination.trim();
  if (!dest) {
    settleChatActivity(get, set);
    return;
  }
  set((s) => ({
    isGeocodingItinerary: true,
    generationProgress: {
      phase: 'geocode',
      llmLatencyMs,
      geocodeDone: 0,
      geocodeTotal: 0,
    },
    chatActivity:
      s.chatActivity?.op === 'generate'
        ? patchActivityStep(s.chatActivity, 'geocode', { status: 'running' })
        : s.chatActivity,
  }));
  void geocodeItineraryNodesStream(itinerary, dest, {
    onProgress: ({ done, total }) => {
      set((s) => ({
        generationProgress: {
          phase: 'geocode',
          llmLatencyMs: s.generationProgress.llmLatencyMs ?? llmLatencyMs,
          geocodeDone: done,
          geocodeTotal: total,
        },
        chatActivity:
          s.chatActivity?.op === 'generate'
            ? patchActivityStep(s.chatActivity, 'geocode', {
                status: 'running',
                detail: total > 0 ? `${done}/${total}` : undefined,
              })
            : s.chatActivity,
      }));
    },
  })
    .then((geocoded) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          const synced = syncItineraryMeta(geocoded, p.trip_request);
          const dupes = findCrossDayPoiDuplicates(synced);
          if (!dupes.length) {
            return { ...p, itinerary: synced };
          }
          const prev = synced.meta?.warnings ?? [];
          const merged = [...prev];
          for (const w of dupes) {
            if (!merged.includes(w)) merged.push(w);
          }
          return {
            ...p,
            itinerary: {
              ...synced,
              meta: { ...synced.meta, warnings: merged },
            },
          };
        }),
      );
      const n = findCrossDayPoiDuplicates(geocoded).length;
      if (n > 0) {
        useToastStore.getState().show(`发现 ${n} 处跨天重复 POI，已写入行程警告`, 'warning');
      }
      set((s) => ({
        chatActivity:
          s.chatActivity?.op === 'generate'
            ? patchActivityStep(s.chatActivity, 'geocode', { status: 'done' })
            : s.chatActivity,
      }));
      settleChatActivity(get, set);
    })
    .catch(() => {
      useToastStore.getState().show(
        '坐标补全失败，可在节点编辑器中手动搜索',
        'warning',
      );
      set((s) => ({
        chatActivity:
          s.chatActivity?.op === 'generate'
            ? patchActivityStep(s.chatActivity, 'geocode', {
                status: 'error',
                detail: '失败',
              })
            : s.chatActivity,
      }));
      settleChatActivity(get, set, '坐标补全失败');
    })
    .finally(() =>
      set({ isGeocodingItinerary: false, generationProgress: idleProgress }),
    );
}

function updateActivePlan(
  state: PlanState,
  updater: (plan: TravelPlan) => TravelPlan,
): Partial<PlanState> {
  const plans = state.plans.map((p) =>
    p.id === state.activePlanId ? touchPlan(updater(p)) : p,
  );
  return { plans };
}

const initial = getInitialState();

export const usePlanStore = create<PlanState>()(
  subscribeWithSelector((set, get) => ({
    plans: initial.plans,
    activePlanId: initial.activePlanId,
    activeDayIndex: 0,
    activeView: 'graph',
    graphViewMode: 'day',
    overviewScrollDay: null,
    selectedNodeId: null,
    selectedEdgeId: null,
    editorTarget: null,
    leftPanelMode: initial.leftPanelMode,
    previewExpandedWithoutItinerary: false,
    mapPickNodeId: null,
    selectedStayZoneId: null,
    exportOverviewCapture: false,
    overviewColumnWidths: {},
    isGeneratingItinerary: false,
    isGeocodingItinerary: false,
    generationProgress: idleProgress,
    chatActivity: null,
    patchUndoSnapshot: null,
    pendingReadinessPrompt: false,
    itineraryHistories: {},

    getActivePlan: () => {
      const s = get();
      return s.plans.find((p) => p.id === s.activePlanId) ?? s.plans[0];
    },

    getItinerary: () => get().getActivePlan().itinerary,

    createPlan: () => {
      const plan = createEmptyPlan();
      set((s) => ({
        plans: [...s.plans, plan],
        activePlanId: plan.id,
        activeDayIndex: 0,
        selectedNodeId: null,
        selectedEdgeId: null,
        graphViewMode: 'day',
      }));
    },

    switchPlan: (id) => {
      set({
        activePlanId: id,
        activeDayIndex: 0,
        selectedNodeId: null,
        selectedEdgeId: null,
        graphViewMode: 'day',
      });
    },

    deletePlan: (id) => {
      set((s) => {
        const plans = s.plans.filter((p) => p.id !== id);
        if (plans.length === 0) {
          const plan = createEmptyPlan();
          return { plans: [plan], activePlanId: plan.id, activeDayIndex: 0, selectedNodeId: null };
        }
        const activePlanId =
          s.activePlanId === id ? plans[0].id : s.activePlanId;
        return {
          plans,
          activePlanId,
          activeDayIndex: 0,
          selectedNodeId: s.activePlanId === id ? null : s.selectedNodeId,
        };
      });
    },

    renamePlan: (id, title) => {
      set((s) => ({
        plans: s.plans.map((p) =>
          p.id === id ? touchPlan({ ...p, title: title.trim() || p.title }) : p,
        ),
      }));
    },

    confirmPatch: (patch) => {
      get().confirmPatches([patch]);
    },

    confirmPatches: (patches) => {
      const hasTripRequestPatch = patches.some(
        (p) =>
          p.action !== 'fork_plan' &&
          (p.target === 'trip_request' ||
            (p.action === 'set' && !p.field_path.startsWith('days['))),
      );

      const forkPatch = patches.find((p) => p.action === 'fork_plan' && p.fork_plan);
      if (forkPatch) {
        const s = get();
          const current = s.getActivePlan();
        const dest = forkPatch.fork_plan!.destination;
        const inherit = forkPatch.fork_plan!.inherit_fields ?? ['preference_tags', 'travelers', 'budget_level'];

          const newPlan = createEmptyPlan(`${dest} 行程（草案）`);
          newPlan.trip_request.destination = dest;
          if (inherit.includes('preference_tags')) {
            newPlan.trip_request.preference_tags = [...current.trip_request.preference_tags];
          }
          if (inherit.includes('travelers') && current.trip_request.travelers) {
            newPlan.trip_request.travelers = current.trip_request.travelers;
          }
          if (inherit.includes('budget_level') && current.trip_request.budget_level) {
            newPlan.trip_request.budget_level = current.trip_request.budget_level;
          }
          newPlan.phase = 'planning';

          const forkPatchIds = new Set(patches.map((x) => x.id));
          set((state) => ({
            plans: [
              ...state.plans.map((p) =>
                p.id === current.id
                  ? {
                      ...p,
                      chat_messages: syncMessagesAfterPatchAction(
                        p.chat_messages,
                        forkPatchIds,
                        'applied',
                      ),
                      pending_patches: p.pending_patches.filter(
                        (x) => !patches.some((pp) => pp.id === x.id),
                      ),
                    }
                  : p,
              ),
              touchPlan(newPlan),
            ],
            activePlanId: newPlan.id,
            activeDayIndex: 0,
            selectedNodeId: null,
            graphViewMode: 'day',
          }));
          return;
      }

      const hasAddNode = patches.some((p) => p.action === 'add_node');
      const destination = get().getActivePlan().trip_request.destination.trim();

      set((s) =>
        updateActivePlan(s, (p) => {
          const appliedIds = new Set(patches.map((x) => x.id));
          const { trip_request, itinerary, skipped } = applyFormPatches(
            p.trip_request,
            p.itinerary,
            patches,
          );

          let syncedItinerary = itinerary;
          if (syncedItinerary) {
            syncedItinerary = syncItineraryMeta(syncedItinerary, trip_request);
          }

          let title = p.title;
          const autoTitle = planTitleFromRequest(trip_request);
          if (autoTitle && patches.some((x) => x.field_path === 'destination')) {
            title = autoTitle;
          }

          if (skipped.length > 0) {
            console.warn('[formPatchTool] skipped patches:', skipped);
          }

          return {
            ...p,
            title,
            trip_request,
            itinerary: syncedItinerary,
            chat_messages: syncMessagesAfterPatchAction(
              p.chat_messages,
              appliedIds,
              'applied',
            ),
            pending_patches: p.pending_patches.filter((x) => !appliedIds.has(x.id)),
          };
        }),
      );

      if (hasTripRequestPatch) {
        void get().maybeAutoGenerateItinerary().then((result) => {
          const show = useToastStore.getState().show;
          if (result === 'api') show('路线图已自动生成', 'info');
          else if (result === 'mock') show('生成 API 不可用，已回退 Mock 行程', 'warning');
        });
      }

      if (hasAddNode && destination) {
        const itinerary = get().getItinerary();
        if (itinerary) {
          runBackgroundGeocode(set, get, itinerary, destination);
          useToastStore.getState().show('新节点坐标补全中…', 'info');
        }
      }
    },

    dismissPatch: (patchId) => {
      get().dismissPatches([patchId]);
    },

    dismissPatches: (patchIds) => {
      const idSet = new Set(patchIds);
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          chat_messages: syncMessagesAfterPatchAction(p.chat_messages, idSet, 'rejected'),
          pending_patches: p.pending_patches.filter((x) => !idSet.has(x.id)),
        })),
      );
    },

    updateTripRequest: (partial) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          const trip_request = { ...p.trip_request, ...partial };
          let itinerary = p.itinerary;
          if (itinerary) {
            itinerary = syncItineraryMeta(itinerary, trip_request);
          }
          return { ...p, trip_request, itinerary };
        }),
      );
    },

    setItinerary: (itinerary) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          const synced = itinerary ? syncItineraryMeta(itinerary, p.trip_request) : null;
          return { ...p, itinerary: synced };
        }),
      );
    },

    generateItinerary: async (mode = 'generate') => {
      const p = get().getActivePlan();
      if (p.travel_intel.flights.length === 0) {
        useToastStore.getState().show('请先确认航班后再生成玩法行程', 'warning');
        return 'blocked';
      }
      if (mode === 'optimize' && !p.itinerary) {
        useToastStore.getState().show('优化适配需要已有行程', 'warning');
        return 'blocked';
      }
      const hasHotels = p.travel_intel.hotels.length > 0;
      const hasZones = (p.travel_intel.recommended_stay_zones ?? []).some(
        (z) => z.status === 'confirmed',
      );
      if (!hasHotels && !hasZones) {
        useToastStore
          .getState()
          .show('尚未确认酒店或住宿片区；行程住宿区域将为估算', 'warning');
      }

      const hasFlights = p.travel_intel.flights.length > 0;
      set({
        isGeneratingItinerary: true,
        generationProgress: { phase: 'evidence', llmPreview: '' },
        chatActivity: createGenerateActivity(hasFlights),
        leftPanelMode: 'chat',
      });
      try {
        const { itinerary, llmLatencyMs } = await generateItineraryStream(p.trip_request, {
          geocode: false,
          travel_intel: p.travel_intel,
          mode,
          current_itinerary:
            mode === 'optimize' || mode === 'regenerate' ? p.itinerary : null,
          onDelta: (preview) => {
            set((s) => {
              let activity = s.chatActivity;
              if (activity?.op === 'generate') {
                const ev = activity.steps.find((x) => x.id === 'evidence');
                if (ev?.status === 'pending') {
                  activity = patchActivityStep(activity, 'evidence', { status: 'skipped' });
                }
                activity = patchActivityStep(activity, 'generate_llm', { status: 'running' });
              }
              return {
                generationProgress: {
                  phase: 'llm' as const,
                  llmPreview: preview,
                  llmLatencyMs: s.generationProgress.llmLatencyMs,
                  evidenceCount: s.generationProgress.evidenceCount,
                },
                chatActivity: activity,
              };
            });
          },
          onProgress: (evt) => {
            if (evt.step === 'reasoning' && evt.text) {
              set((s) => ({
                chatActivity:
                  s.chatActivity?.op === 'generate'
                    ? { ...s.chatActivity, reasoning: evt.text }
                    : s.chatActivity,
              }));
              return;
            }
            if (evt.step === 'evidence') {
              set((s) => ({
                generationProgress: {
                  ...s.generationProgress,
                  phase: 'evidence',
                  evidenceCount: evt.count ?? s.generationProgress.evidenceCount,
                },
                chatActivity:
                  s.chatActivity?.op === 'generate'
                    ? patchActivityStep(s.chatActivity, 'evidence', {
                        status: evt.status === 'done' ? 'done' : 'running',
                        detail:
                          evt.status === 'done' && evt.count != null
                            ? `${evt.count} 条`
                            : undefined,
                      })
                    : s.chatActivity,
              }));
              return;
            }
            if (evt.step === 'llm') {
              set((s) => {
                let activity = s.chatActivity;
                if (activity?.op === 'generate') {
                  const ev = activity.steps.find((x) => x.id === 'evidence');
                  if (ev && ev.status === 'pending') {
                    activity = patchActivityStep(activity, 'evidence', { status: 'skipped' });
                  } else if (ev && ev.status === 'running') {
                    activity = patchActivityStep(activity, 'evidence', { status: 'done' });
                  }
                  activity = patchActivityStep(activity, 'generate_llm', {
                    status: evt.status === 'done' ? 'done' : 'running',
                  });
                }
                return {
                  generationProgress: {
                    phase: 'llm' as const,
                    llmPreview: s.generationProgress.llmPreview,
                    llmLatencyMs:
                      evt.status === 'done'
                        ? evt.latencyMs
                        : s.generationProgress.llmLatencyMs,
                    evidenceCount: s.generationProgress.evidenceCount,
                  },
                  chatActivity: activity,
                };
              });
            }
          },
        });
        set((s) =>
          updateActivePlan(s, (plan) => ({
            ...plan,
            itinerary: syncItineraryMeta(itinerary, plan.trip_request),
          })),
        );
        set((s) => ({
          isGeneratingItinerary: false,
          chatActivity:
            s.chatActivity?.op === 'generate'
              ? patchActivityStep(s.chatActivity, 'generate_llm', { status: 'done' })
              : s.chatActivity,
        }));
        const evidenceItems = itinerary.meta?.evidence ?? [];
        const evidenceCount = evidenceItems.length;
        if (evidenceCount > 0) {
          const verified = evidenceItems.filter((e) => e.verified).length;
          const suffix =
            verified > 0
              ? `（非官方 · ${verified} 条含围栏内已定位地点）`
              : '（非官方 · 网友提及未核验）';
          useToastStore.getState().show(`已参考 ${evidenceCount} 条印证${suffix}`, 'info');
        }
        const modeLabel =
          mode === 'optimize' ? '已优化适配机酒' : mode === 'regenerate' ? '已按新机酒重构' : null;
        if (modeLabel) useToastStore.getState().show(modeLabel, 'info');
        const dest = p.trip_request.destination?.trim();
        if (dest) {
          runBackgroundGeocode(set, get, itinerary, dest, llmLatencyMs);
        } else {
          set((s) => ({
            generationProgress: idleProgress,
            chatActivity:
              s.chatActivity?.op === 'generate'
                ? patchActivityStep(s.chatActivity, 'geocode', { status: 'skipped' })
                : s.chatActivity,
          }));
          settleChatActivity(get, set);
        }
        return 'api';
      } catch {
        if (mode !== 'generate') {
          settleChatActivity(get, set, '行程更新失败');
          set({ isGeneratingItinerary: false, generationProgress: idleProgress });
          useToastStore.getState().show('行程更新失败，请稍后重试', 'error');
          return 'blocked';
        }
        set((s) =>
          updateActivePlan(s, (plan) => {
            const itinerary = buildMockItinerary(plan.trip_request);
            return { ...plan, itinerary: syncItineraryMeta(itinerary, plan.trip_request) };
          }),
        );
        set({ isGeneratingItinerary: false });
        const dest = p.trip_request.destination?.trim();
        const mockItinerary = get().getItinerary();
        if (dest && mockItinerary) {
          runBackgroundGeocode(set, get, mockItinerary, dest);
        } else {
          set({ generationProgress: idleProgress });
          settleChatActivity(get, set, '已回退 Mock 行程');
        }
        return 'mock';
      }
    },

    setFlightSearchResult: (session) => {
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          travel_intel: { ...p.travel_intel, last_flight_search: session },
        })),
      );
    },

    mergeFlightSearchResult: (patch) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          const prev = p.travel_intel.last_flight_search;
          if (!prev) return p;
          return {
            ...p,
            travel_intel: {
              ...p.travel_intel,
              last_flight_search: { ...prev, ...patch },
            },
          };
        }),
      );
    },

    confirmFlightQuote: (quoteId, role = 'outbound') => {
      const search = get().getActivePlan().travel_intel.last_flight_search;
      const quote = search?.ranked.find((o) => o.id === quoteId);
      const isRoundTrip = quote ? isRoundTripQuote(quote) : false;

      set((s) =>
        updateActivePlan(s, (p) => {
          const session = p.travel_intel.last_flight_search;
          const q = session?.ranked.find((o) => o.id === quoteId);
          if (!q || !session) return p;

          const startSequence =
            p.travel_intel.flights.length > 0
              ? Math.max(...p.travel_intel.flights.map((f) => f.sequence)) + 1
              : 1;

          const newLegs = flightLegsFromQuote(q, {
            startSequence,
            role,
            purchaseUrl: session.purchase_url,
          });

          let flights = [...p.travel_intel.flights];
          if (isRoundTripQuote(q)) {
            flights = flights.filter((f) => f.role !== 'outbound' && f.role !== 'return');
            flights.push(...newLegs);
          } else if (role === 'intercity') {
            flights.push(...newLegs);
          } else {
            flights = flights.filter((f) => f.role !== role);
            flights.push(...newLegs);
          }

          return {
            ...p,
            travel_intel: syncTravelIntelStatus({
              ...p.travel_intel,
              flights: renumberFlightSequences(flights),
              last_flight_search: {
                ...session,
                confirmed_quote_id: quoteId,
                hide_ranked: true,
              },
            }),
          };
        }),
      );
      // B-P3：留在航班面板，便于添加下一段 / 城际
      set({ leftPanelMode: 'flight' });
      useToastStore.getState().show(
        isRoundTrip
          ? '已确认往返航段，可继续添加城际或前往住宿'
          : '已确认航段，可继续添加下一段或前往住宿',
        'info',
      );
      // UX-CHAT-09：确认后对话给出下一跳，不自动 regenerate
      get().addChatMessage(
        'assistant',
        '航班已确认。可继续确认住宿片区，或使用下方检查清单生成玩法。',
      );
      get().requestReadinessPrompt();
    },

    addManualFlightLeg: (input) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          const startSequence =
            p.travel_intel.flights.length > 0
              ? Math.max(...p.travel_intel.flights.map((f) => f.sequence)) + 1
              : 1;

          const leg = flightLegFromManualInput(input, {
            sequence: startSequence,
            defaultPurchaseUrl: p.travel_intel.last_flight_search?.purchase_url,
          });

          const flights =
            input.role === 'intercity'
              ? [...p.travel_intel.flights, leg]
              : [...p.travel_intel.flights.filter((f) => f.role !== input.role), leg];

          return {
            ...p,
            travel_intel: syncTravelIntelStatus({
              ...p.travel_intel,
              flights: renumberFlightSequences(flights),
            }),
          };
        }),
      );
      set({ leftPanelMode: 'flight' });
      useToastStore.getState().show('已添加航段，可继续添加下一段或前往住宿', 'info');
    },

    removeFlightLeg: (legId) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          const removed = p.travel_intel.flights.find((f) => f.id === legId);
          let flights = p.travel_intel.flights.filter((f) => f.id !== legId);
          if (removed?.bundle_id) {
            flights = flights.filter((f) => f.bundle_id !== removed.bundle_id);
          }
          flights = renumberFlightSequences(flights);

          const session = p.travel_intel.last_flight_search;
          const last_flight_search = session
            ? syncFlightSearchAfterLegRemoval(session, flights)
            : session;

          const travel_intel = syncTravelIntelStatus({
            ...p.travel_intel,
            flights,
            last_flight_search,
          });
          return { ...p, travel_intel };
        }),
      );
    },

    recommendStayZones: (zones, fetchedAt) => {
      const hasGeometry = zones.some((z) => Boolean(z.geometry));
      set((s) => {
        const next = updateActivePlan(s, (p) => ({
          ...p,
          travel_intel: syncTravelIntelStatus({
            ...p.travel_intel,
            recommended_stay_zones: zones,
            stay_zones_fetched_at: fetchedAt,
          }),
        }));
        // UX-14-05：有 geometry 时强制展开预览并切 map
        if (hasGeometry) {
          return {
            ...next,
            previewExpandedWithoutItinerary: true,
            activeView: 'map' as const,
          };
        }
        return next;
      });
    },

    setStayZonePreferences: (prefs) => {
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          travel_intel: { ...p.travel_intel, stay_zone_preferences: prefs },
        })),
      );
    },

    confirmStayZone: (zoneId) => {
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          travel_intel: patchStayZones(p.travel_intel, (zones) =>
            zones.map((z) =>
              z.id === zoneId ? { ...z, status: 'confirmed' as const } : z,
            ),
          ),
        })),
      );
      // UX-CHAT-09
      get().addChatMessage(
        'assistant',
        '住宿片区已确认。可使用下方检查清单生成玩法（不会因改机酒自动重生成）。',
      );
      get().requestReadinessPrompt();
    },

    rejectStayZone: (zoneId) => {
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          travel_intel: patchStayZones(p.travel_intel, (zones) =>
            zones.map((z) =>
              z.id === zoneId ? { ...z, status: 'rejected' as const } : z,
            ),
          ),
        })),
      );
    },

    addHotelFromZone: (zoneId, input) => {
      const plan = get().getActivePlan();
      const itinerary = plan.itinerary;
      if (!itinerary) return null;
      const zone = (plan.travel_intel.recommended_stay_zones ?? []).find(
        (z) => z.id === zoneId,
      );
      if (!zone || zone.status !== 'confirmed') return null;

      get().recordItineraryHistory();
      const { itinerary: nextItinerary, nodeId } = addHotelNodeForZone(itinerary, zone, {
        name: input.name,
        lat: input.lat,
        lng: input.lng,
        address: input.address,
        coord_source: input.pendingMapPick ? 'map_pick' : input.coord_source,
      });

      const ctx = findNodeContext(nextItinerary, nodeId);
      const node = ctx?.node;
      if (!node) return null;

      const sequence =
        plan.travel_intel.hotels.length > 0
          ? Math.max(...plan.travel_intel.hotels.map((h) => h.sequence)) + 1
          : 1;

      const hotel = hotelFromZoneAndNode(zone, nodeId, node, {
        sequence,
        pendingMapPick: input.pendingMapPick,
      });

      set((s) => ({
        ...updateActivePlan(s, (p) => ({
          ...p,
          itinerary: nextItinerary,
          travel_intel: syncTravelIntelStatus({
            ...p.travel_intel,
            hotels: [...p.travel_intel.hotels.filter((h) => h.zone_id !== zoneId), hotel],
          }),
        })),
        selectedNodeId: nodeId,
        activeDayIndex: ctx.dayIndex,
        leftPanelMode: input.pendingMapPick ? 'form' : s.leftPanelMode,
      }));

      return nodeId;
    },

    removeHotelStay: (hotelId) => {
      const plan = get().getActivePlan();
      const hotel = plan.travel_intel.hotels.find((h) => h.id === hotelId);
      if (!hotel) return;

      if (hotel.itinerary_node_id && plan.itinerary) {
        const ctx = findNodeContext(plan.itinerary, hotel.itinerary_node_id);
        if (ctx) {
          get().recordItineraryHistory();
          set((s) => {
            const next = updateActivePlan(s, (p) => {
              if (!p.itinerary) return p;
              return {
                ...p,
                itinerary: removeNodeFromItinerary(
                  p.itinerary,
                  ctx.dayIndex,
                  hotel.itinerary_node_id!,
                ),
                travel_intel: removeHotelFromIntel(p.travel_intel, hotelId),
              };
            });
            return {
              ...next,
              selectedNodeId:
                s.selectedNodeId === hotel.itinerary_node_id ? null : s.selectedNodeId,
            };
          });
          return;
        }
      }

      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          travel_intel: removeHotelFromIntel(p.travel_intel, hotelId),
        })),
      );
    },

    setSelectedStayZoneId: (zoneId) => set({ selectedStayZoneId: zoneId }),

    maybeAutoGenerateItinerary: async () => {
      const plan = get().getActivePlan();
      if (!shouldAutoGenerateItinerary(plan)) return 'skipped';
      return get().generateItinerary();
    },

    generateMockItinerary: () => {
      set((s) =>
        updateActivePlan(s, (p) => {
          const itinerary = buildMockItinerary(p.trip_request);
          return { ...p, itinerary: syncItineraryMeta(itinerary, p.trip_request) };
        }),
      );
    },

    updateNode: (dayIndex, nodeId, partial) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          const days = p.itinerary.days.map((day, i) => {
            if (i !== dayIndex) return day;
            return {
              ...day,
              nodes: day.nodes.map((n) => (n.id === nodeId ? { ...n, ...partial } : n)),
            };
          });
          const nextItinerary = { ...p.itinerary, days };
          const node = findNodeContext(nextItinerary, nodeId)?.node;
          const travel_intel =
            node?.category === 'hotel'
              ? syncIntelHotelFromNode(p.travel_intel, nodeId, { ...node, ...partial })
              : p.travel_intel;
          return { ...p, itinerary: nextItinerary, travel_intel };
        }),
      );
    },

    updateDay: (dayIndex, partial) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          const days = p.itinerary.days.map((day, i) =>
            i === dayIndex ? { ...day, ...partial } : day,
          );
          return { ...p, itinerary: { ...p.itinerary, days } };
        }),
      );
    },

    setDayRegion: (dayIndex, region) => {
      const itinerary = get().getItinerary();
      if (!itinerary) return;
      const oldDay = itinerary.days[dayIndex];
      if (!oldDay) return;
      const trimmed = region.trim();
      const nextRegion = trimmed || undefined;
      if ((oldDay.region ?? '') === (nextRegion ?? '')) return;

      get().recordItineraryHistory();
      const nextItinerary = syncDayRegionToNodes(
        itinerary,
        dayIndex,
        oldDay.region,
        nextRegion,
      );
      const affected = oldDay.nodes.filter((node) => {
        const nr = node.region?.trim();
        const oldTrim = oldDay.region?.trim() || '';
        return !nr || (oldTrim && nr === oldTrim);
      }).length;

      set((s) =>
        updateActivePlan(s, (p) => ({ ...p, itinerary: nextItinerary })),
      );

      if (affected > 0) {
        useToastStore.getState().show(
          `已同步更新当日 ${affected} 个节点的落格区域`,
          'info',
        );
      }
    },

    setDayDate: (dayIndex, date) => {
      const itinerary = get().getItinerary();
      if (!itinerary) return;
      const oldDay = itinerary.days[dayIndex];
      if (!oldDay || oldDay.date === date) return;

      get().recordItineraryHistory();
      const weekday = weekdayFromDate(date);
      const days = itinerary.days.map((day, i) =>
        i === dayIndex ? { ...day, date, weekday } : day,
      );
      const nextItinerary = { ...itinerary, days };

      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          itinerary: nextItinerary,
          trip_request: { ...p.trip_request, ...tripRequestDatesPatch(days) },
        })),
      );

      const allDates = days.map((d) => d.date);
      if (countOtherDaysWithDate(allDates, date, dayIndex) > 0) {
        useToastStore.getState().show('与其它天日期相同，请确认是否合理', 'warning');
      }
      if (isDayDateOrderInconsistent(allDates)) {
        useToastStore.getState().show(
          '日期顺序与 Day 列序不一致，可在下方点击「按日期排序」',
          'warning',
        );
      }
    },

    updateDayWeather: (dayIndex, partial) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          const days = p.itinerary.days.map((day, i) => {
            if (i !== dayIndex) return day;
            const icon = partial.icon ?? day.weather?.icon ?? 'cloudy';
            const weather: DayWeather = {
              temp_min: day.weather?.temp_min ?? 22,
              temp_max: day.weather?.temp_max ?? 30,
              icon: day.weather?.icon ?? 'cloudy',
              description: day.weather?.description ?? weatherIconLabel(icon),
              source: 'manual',
              ...day.weather,
              ...partial,
              ...(partial.icon != null
                ? { description: weatherIconLabel(partial.icon) }
                : {}),
            };
            return { ...day, weather };
          });
          return { ...p, itinerary: { ...p.itinerary, days } };
        }),
      );
    },

    updateNodePosition: (dayIndex, nodeId, position) => {
      get().updateNode(dayIndex, nodeId, { position });
    },

    updateNodeOverviewOffset: (dayIndex, nodeId, offset) => {
      get().updateNode(dayIndex, nodeId, { overview_offset: offset });
    },

    recordItineraryHistory: () => {
      set((s) => {
        const plan = selectActivePlan(s);
        if (!plan.itinerary) return {};
        const stacks = pushItineraryHistory(
          s.itineraryHistories[plan.id],
          plan.itinerary,
        );
        return {
          itineraryHistories: { ...s.itineraryHistories, [plan.id]: stacks },
        };
      });
    },

    undoItinerary: () => {
      let applied = false;
      set((s) => {
        const plan = selectActivePlan(s);
        if (!plan.itinerary) return {};
        const stacks = s.itineraryHistories[plan.id];
        if (!stacks) return {};
        const result = popItineraryUndo(stacks, plan.itinerary);
        if (!result) return {};
        applied = true;
        const planUpdates = updateActivePlan(s, (p) => ({
          ...p,
          itinerary: result.itinerary,
        }));
        return {
          ...planUpdates,
          itineraryHistories: { ...s.itineraryHistories, [plan.id]: result.stacks },
        };
      });
      return applied;
    },

    redoItinerary: () => {
      let applied = false;
      set((s) => {
        const plan = selectActivePlan(s);
        if (!plan.itinerary) return {};
        const stacks = s.itineraryHistories[plan.id];
        if (!stacks) return {};
        const result = popItineraryRedo(stacks, plan.itinerary);
        if (!result) return {};
        applied = true;
        const planUpdates = updateActivePlan(s, (p) => ({
          ...p,
          itinerary: result.itinerary,
        }));
        return {
          ...planUpdates,
          itineraryHistories: { ...s.itineraryHistories, [plan.id]: result.stacks },
        };
      });
      return applied;
    },

    canUndoItinerary: () => {
      const s = get();
      const plan = selectActivePlan(s);
      return (s.itineraryHistories[plan.id]?.past.length ?? 0) > 0;
    },

    canRedoItinerary: () => {
      const s = get();
      const plan = selectActivePlan(s);
      return (s.itineraryHistories[plan.id]?.future.length ?? 0) > 0;
    },

    addNode: (dayIndex, options) => {
      let newNodeId: string | null = null;
      set((s) => {
        const planUpdates = updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          const { itinerary, nodeId } = addNodeToItinerary(p.itinerary, dayIndex, options ?? {});
          newNodeId = nodeId;
          return { ...p, itinerary };
        });
        return {
          ...planUpdates,
          selectedNodeId: newNodeId,
          activeDayIndex: dayIndex,
          leftPanelMode: 'form',
        };
      });
    },

    removeNode: (dayIndex, nodeId) => {
      set((s) => {
        const next = updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          const node = p.itinerary.days[dayIndex]?.nodes.find((n) => n.id === nodeId);
          const travel_intel =
            node?.category === 'hotel'
              ? removeHotelByNodeId(p.travel_intel, nodeId)
              : p.travel_intel;
          return {
            ...p,
            itinerary: removeNodeFromItinerary(p.itinerary, dayIndex, nodeId),
            travel_intel,
          };
        });
        return {
          ...next,
          selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
          selectedEdgeId:
            s.selectedEdgeId &&
            (() => {
              const it = s.getItinerary();
              if (!it) return null;
              const ec = findEdgeContext(it, s.selectedEdgeId);
              if (!ec) return null;
              return ec.edge.from === nodeId || ec.edge.to === nodeId ? null : s.selectedEdgeId;
            })(),
        };
      });
    },

    connectNodes: (dayIndex, from, to, partial) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          return {
            ...p,
            itinerary: connectNodesInItinerary(p.itinerary, dayIndex, from, to, partial),
          };
        }),
      );
    },

    updateEdge: (dayIndex, edgeId, patch) => {
      set((s) => {
        const oldCtx = s.getItinerary()
          ? findEdgeContext(s.getItinerary()!, edgeId)
          : null;
        const planUpdates = updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          return {
            ...p,
            itinerary: updateEdgeInItinerary(p.itinerary, dayIndex, edgeId, patch),
          };
        });
        let selectedEdgeId = s.selectedEdgeId;
        if (s.selectedEdgeId === edgeId && oldCtx?.scope === 'day') {
          const from = patch.from ?? oldCtx.edge.from;
          const to = patch.to ?? oldCtx.edge.to;
          selectedEdgeId = makeEdgeId(from, to);
        }
        return { ...planUpdates, selectedEdgeId };
      });
    },

    updateCrossDayEdge: (edgeId, patch) => {
      set((s) => {
        const oldCtx = s.getItinerary()
          ? findEdgeContext(s.getItinerary()!, edgeId)
          : null;
        const planUpdates = updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          return {
            ...p,
            itinerary: updateCrossDayEdgeInItinerary(p.itinerary, edgeId, patch),
          };
        });
        let selectedEdgeId = s.selectedEdgeId;
        if (s.selectedEdgeId === edgeId && oldCtx?.scope === 'cross_day') {
          const from = patch.from ?? oldCtx.edge.from;
          const to = patch.to ?? oldCtx.edge.to;
          selectedEdgeId = makeEdgeId(from, to);
        }
        return { ...planUpdates, selectedEdgeId };
      });
    },

    removeEdge: (dayIndex, edgeId) => {
      set((s) => {
        const planUpdates = updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          return {
            ...p,
            itinerary: removeEdgeFromItinerary(p.itinerary, dayIndex, edgeId),
          };
        });
        return {
          ...planUpdates,
          selectedEdgeId: s.selectedEdgeId === edgeId ? null : s.selectedEdgeId,
        };
      });
    },

    removeCrossDayEdge: (edgeId) => {
      set((s) => {
        const planUpdates = updateActivePlan(s, (p) => {
          if (!p.itinerary) return p;
          return {
            ...p,
            itinerary: removeCrossDayEdgeFromItinerary(p.itinerary, edgeId),
          };
        });
        return {
          ...planUpdates,
          selectedEdgeId: s.selectedEdgeId === edgeId ? null : s.selectedEdgeId,
        };
      });
    },

    addChatMessage: (role, content, options) => {
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          chat_messages: [
            ...p.chat_messages,
            {
              id: crypto.randomUUID(),
              role,
              content,
              created_at: new Date().toISOString(),
              ...(options?.chat_mode ? { chat_mode: options.chat_mode } : {}),
              ...(options?.patches ? { patches: options.patches } : {}),
              ...(options?.patch_status ? { patch_status: options.patch_status } : {}),
            },
          ],
        })),
      );
    },

    addPendingPatches: (patches) => {
      if (patches.length === 0) return;
      const batchId = crypto.randomUUID();
      const tagged = patches.map((p) => ({ ...p, batch_id: p.batch_id ?? batchId }));
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          chat_messages: tagLastAssistantPatches(p.chat_messages, tagged),
          pending_patches: [...p.pending_patches, ...tagged],
        })),
      );
    },

    setLastChatMode: (mode) => {
      set((s) => updateActivePlan(s, (p) => ({ ...p, last_chat_mode: mode })));
    },

    setLeftPanelMode: (mode) => set({ leftPanelMode: mode }),
    setPreviewExpandedWithoutItinerary: (expanded) =>
      set({ previewExpandedWithoutItinerary: expanded }),
    setChatActivity: (activity) => set({ chatActivity: activity }),
    updateChatActivity: (updater) =>
      set((s) => {
        if (!s.chatActivity) return s;
        return { chatActivity: updater(s.chatActivity) };
      }),
    setPatchUndoSnapshot: (snapshot) => set({ patchUndoSnapshot: snapshot }),
    clearPatchUndoSnapshot: () => set({ patchUndoSnapshot: null }),
    undoLastAutoPatches: () => {
      const snap = get().patchUndoSnapshot;
      if (!snap || Date.now() > snap.expiresAt) {
        set({ patchUndoSnapshot: null });
        return false;
      }
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          trip_request: structuredClone(snap.trip_request),
          itinerary: snap.itinerary ? structuredClone(snap.itinerary) : null,
        })),
      );
      set({ patchUndoSnapshot: null });
      useToastStore.getState().show('已撤销自动写入', 'info');
      return true;
    },
    requestReadinessPrompt: () => set({ pendingReadinessPrompt: true }),
    consumeReadinessPrompt: () => set({ pendingReadinessPrompt: false }),

    setActiveDay: (index) =>
      set({
        activeDayIndex: index,
        selectedNodeId: null,
        selectedEdgeId: null,
        mapPickNodeId: null,
        editorTarget: null,
      }),
    setActiveView: (view) =>
      set((s) => ({
        activeView: view,
        ...(view !== 'map' && s.mapPickNodeId ? { mapPickNodeId: null } : {}),
      })),
    setGraphViewMode: (mode) =>
      set({
        graphViewMode: mode,
        selectedNodeId: null,
        selectedEdgeId: null,
        mapPickNodeId: null,
        editorTarget: null,
      }),
    scrollOverviewToDay: (dayIndex) => set({ overviewScrollDay: dayIndex, activeDayIndex: dayIndex }),
    clearOverviewScrollDay: () => set({ overviewScrollDay: null }),
    selectNode: (id) =>
      set((s) => ({
        selectedNodeId: id,
        selectedEdgeId: null,
        editorTarget: id ? null : s.editorTarget,
        mapPickNodeId: id && s.mapPickNodeId && s.mapPickNodeId !== id ? null : s.mapPickNodeId,
        ...(id && s.leftPanelMode !== 'chat' ? { leftPanelMode: 'form' as const } : {}),
      })),
    selectEdge: (id) =>
      set((s) => ({
        selectedEdgeId: id,
        selectedNodeId: null,
        editorTarget: id ? null : s.editorTarget,
        mapPickNodeId: null,
        ...(id && s.leftPanelMode !== 'chat' ? { leftPanelMode: 'form' as const } : {}),
      })),
    selectDay: (dayIndex) =>
      set({
        activeDayIndex: dayIndex,
        selectedNodeId: null,
        selectedEdgeId: null,
        mapPickNodeId: null,
        editorTarget: { kind: 'form', focus: 'day', dayIndex },
        leftPanelMode: 'form',
      }),
    selectRegion: (name) =>
      set({
        selectedNodeId: null,
        selectedEdgeId: null,
        mapPickNodeId: null,
        editorTarget: { kind: 'form', focus: 'region', regionName: name },
        leftPanelMode: 'form',
      }),
    renameRegion: (oldName, newName) => {
      const trimmed = newName.trim();
      if (!trimmed || oldName === trimmed) return;
      const itinerary = get().getItinerary();
      if (!itinerary || regionExists(itinerary, trimmed)) {
        useToastStore.getState().show('区域名已存在或无效', 'warning');
        return;
      }
      get().recordItineraryHistory();
      set((s) => {
        const nextItinerary = renameRegionInItinerary(itinerary, oldName, trimmed);
        const editorTarget =
          s.editorTarget?.kind === 'form' &&
          s.editorTarget.focus === 'region' &&
          s.editorTarget.regionName === oldName
            ? { kind: 'form' as const, focus: 'region' as const, regionName: trimmed }
            : s.editorTarget;
        return {
          ...updateActivePlan(s, (p) => ({ ...p, itinerary: nextItinerary })),
          editorTarget,
        };
      });
    },
    addRegion: (name, dayIndex) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const s = get();
      const itinerary = s.getItinerary();
      if (!itinerary) return false;
      if (regionExists(itinerary, trimmed)) {
        useToastStore.getState().show('区域名已存在', 'warning');
        return false;
      }
      const targetDay = dayIndex ?? s.activeDayIndex;
      get().recordItineraryHistory();
      set((state) =>
        updateActivePlan(state, (p) => {
          if (!p.itinerary) return p;
          return {
            ...p,
            itinerary: addRegionToItinerary(p.itinerary, trimmed, targetDay),
          };
        }),
      );
      get().selectRegion(trimmed);
      return true;
    },
    addDay: (options = {}) => {
      const itinerary = get().getItinerary();
      if (!itinerary) return -1;
      get().recordItineraryHistory();
      const insertIndex = options.insertIndex ?? itinerary.days.length;
      const nextItinerary = addDayToItinerary(itinerary, options);
      const newIndex = insertIndex;
      set((s) => {
        const planId = s.activePlanId;
        const prevWidths = s.overviewColumnWidths[planId] ?? [];
        const nextWidths =
          insertIndex >= prevWidths.length
            ? [...prevWidths, 0]
            : spliceOverviewColumnWidth(prevWidths, insertIndex, 0);
        return {
          ...updateActivePlan(s, (p) => ({
            ...p,
            itinerary: nextItinerary,
            trip_request: {
              ...p.trip_request,
              ...tripRequestDatesPatch(nextItinerary.days),
            },
          })),
          activeDayIndex: newIndex,
          selectedNodeId: null,
          selectedEdgeId: null,
          mapPickNodeId: null,
          editorTarget: { kind: 'form', focus: 'day', dayIndex: newIndex },
          leftPanelMode: 'form',
          overviewColumnWidths: {
            ...s.overviewColumnWidths,
            [planId]: nextWidths,
          },
        };
      });
      return newIndex;
    },
    insertDayAfter: (dayIndex) => get().addDay({ insertIndex: dayIndex + 1 }),
    removeDay: (dayIndex) => {
      const s = get();
      const itinerary = s.getItinerary();
      if (!itinerary) return false;
      const result = removeDayFromItinerary(itinerary, dayIndex);
      if (!result) {
        useToastStore.getState().show('至少保留一天行程', 'warning');
        return false;
      }

      get().recordItineraryHistory();
      const deletedNodeIds = new Set(itinerary.days[dayIndex]?.nodes.map((n) => n.id) ?? []);
      const { itinerary: nextItinerary, nodeIdMap } = result;
      const planId = s.activePlanId;
      const prevWidths = s.overviewColumnWidths[planId] ?? [];
      const nextWidths = removeOverviewColumnWidth(prevWidths, dayIndex);

      const remapIndex = (idx: number) => {
        if (idx > dayIndex) return idx - 1;
        if (idx === dayIndex) return Math.max(0, dayIndex - 1);
        return idx;
      };

      const newActive = remapIndex(s.activeDayIndex);
      let editorTarget = s.editorTarget;
      if (editorTarget?.kind === 'form' && editorTarget.focus === 'day') {
        editorTarget = {
          kind: 'form',
          focus: 'day',
          dayIndex: remapIndex(editorTarget.dayIndex),
        };
      }

      const selectedNodeId =
        s.selectedNodeId && !deletedNodeIds.has(s.selectedNodeId)
          ? (nodeIdMap.get(s.selectedNodeId) ?? s.selectedNodeId)
          : null;

      set({
        ...updateActivePlan(s, (p) => ({
          ...p,
          itinerary: nextItinerary,
          trip_request: {
            ...p.trip_request,
            ...tripRequestDatesPatch(nextItinerary.days),
          },
        })),
        activeDayIndex: newActive,
        selectedNodeId,
        selectedEdgeId: null,
        mapPickNodeId: null,
        editorTarget,
        overviewColumnWidths: {
          ...s.overviewColumnWidths,
          [planId]: nextWidths,
        },
      });
      return true;
    },
    sortDaysByDate: () => {
      const s = get();
      const itinerary = s.getItinerary();
      if (!itinerary) return;

      get().recordItineraryHistory();
      const { itinerary: nextItinerary, indexMap, nodeIdMap } =
        reorderItineraryDaysByDate(itinerary);

      const planId = s.activePlanId;
      const prevWidths = s.overviewColumnWidths[planId] ?? [];
      const nextWidths = permuteOverviewColumnWidths(
        prevWidths,
        indexMap,
        nextItinerary.days.length,
      );

      const newActive = indexMap.get(s.activeDayIndex) ?? s.activeDayIndex;
      let editorTarget = s.editorTarget;
      if (editorTarget?.kind === 'form' && editorTarget.focus === 'day') {
        editorTarget = {
          kind: 'form',
          focus: 'day',
          dayIndex: indexMap.get(editorTarget.dayIndex) ?? editorTarget.dayIndex,
        };
      }

      const selectedNodeId = s.selectedNodeId
        ? (nodeIdMap.get(s.selectedNodeId) ?? s.selectedNodeId)
        : null;

      set({
        ...updateActivePlan(s, (p) => ({
          ...p,
          itinerary: nextItinerary,
          trip_request: {
            ...p.trip_request,
            ...tripRequestDatesPatch(nextItinerary.days),
          },
        })),
        activeDayIndex: newActive,
        selectedNodeId,
        selectedEdgeId: null,
        editorTarget,
        overviewColumnWidths: {
          ...s.overviewColumnWidths,
          [planId]: nextWidths,
        },
      });
      useToastStore.getState().show('已按日期重新排列各天', 'info');
    },
    startMapPick: (nodeId) =>
      set({
        mapPickNodeId: nodeId,
        selectedNodeId: nodeId,
        selectedEdgeId: null,
        activeView: 'map',
        leftPanelMode: 'form',
      }),
    cancelMapPick: () => set({ mapPickNodeId: null }),
    setExportOverviewCapture: (value) => set({ exportOverviewCapture: value }),

    setOverviewColumnWidth: (dayIndex, width) => {
      set((s) => {
        const planId = s.activePlanId;
        const prev = s.overviewColumnWidths[planId] ?? [];
        const next = [...prev];
        while (next.length <= dayIndex) next.push(0);
        next[dayIndex] = Math.round(width);
        return {
          overviewColumnWidths: {
            ...s.overviewColumnWidths,
            [planId]: next,
          },
        };
      });
    },
  })),
);

let saveTimer: ReturnType<typeof setTimeout> | null = null;

usePlanStore.subscribe(
  (s) => ({ plans: s.plans, activePlanId: s.activePlanId, leftPanelMode: s.leftPanelMode }),
  ({ plans, activePlanId, leftPanelMode }) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      savePlansToStorage({
        version: 3,
        active_plan_id: activePlanId,
        plans,
        left_panel_mode: leftPanelMode,
      });
    }, 400);
  },
);

export function findNodeContext(
  itinerary: Itinerary,
  nodeId: string,
): { dayIndex: number; node: ItineraryNode } | null {
  for (let i = 0; i < itinerary.days.length; i++) {
    const node = itinerary.days[i].nodes.find((n) => n.id === nodeId);
    if (node) return { dayIndex: i, node };
  }
  return null;
}

export { findEdgeContext, type EdgeContext };
