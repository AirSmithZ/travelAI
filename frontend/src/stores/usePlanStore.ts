import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Itinerary, ItineraryNode, GraphViewMode, ViewTab, DayPlan, DayWeather } from '../types/itinerary';
import type {
  FormPatch,
  TravelPlan,
  ChatMode,
  EvidenceLinkModule,
} from '../types/travelPlan';
import { fetchEvidenceFromLink } from '../api/evidence';
import { validateEvidenceUrl } from '../utils/evidenceLinkUrl';
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
import type { StayHotelMapPin } from '../utils/stayHotelMapPins';
import { applyHotelDayLoop, hasLockedHotel } from '../utils/hotelDayLoop';
import { findCrossDayPoiDuplicates } from '../utils/crossDayPoiDedup';
import {
  hotelFromStandaloneInput,
  hotelFromZoneInput,
  patchStayZones,
  rebindHotelsAfterGenerate,
  removeHotelByNodeId,
  removeHotelFromIntel,
  syncIntelHotelFromNode,
} from '../utils/hotelIntelSync';

export type GenerationPhase =
  | 'idle'
  | 'llm'
  | 'geocode'
  | 'evidence'
  | 'weather'
  | 'validate';

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

/** P112: 店名搜索锁定 — 不绑定 zone_id */
export interface AddStandaloneHotelInput {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  coord_source?: string;
  city?: string;
  check_in?: string;
  check_out?: string;
}

function isStandaloneHotel(h: { zone_id?: string | null }): boolean {
  return !h.zone_id;
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
  /** P100: 锁店阶段酒店候选/已锁酒店预览钉（无行程节点时） */
  stayHotelMapPins: StayHotelMapPin[];
  /** P109: 地图钉点击 → StayZonePanel 选中对应候选 */
  stayHotelMapPinPickId: string | null;
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
  ) => Promise<'api' | 'error' | 'blocked'>;
  maybeAutoGenerateItinerary: () => Promise<'api' | 'error' | 'skipped' | 'blocked'>;
  /** doc 23: 玩法印证贴链模块 */
  addEvidenceLink: (url?: string) => string | null;
  removeEvidenceLink: (moduleId: string) => void;
  updateEvidenceLinkUrl: (moduleId: string, url: string) => void;
  fetchEvidenceLink: (moduleId: string) => Promise<boolean>;
  setFlightSearchResult: (session: FlightSearchSession) => void;
  mergeFlightSearchResult: (patch: Partial<FlightSearchSession>) => void;
  confirmFlightQuote: (quoteId: string, role?: FlightLegRole) => void;
  addManualFlightLeg: (input: ManualFlightLegInput) => void;
  removeFlightLeg: (legId: string) => void;
  recommendStayZones: (zones: RecommendedStayZone[], fetchedAt: string) => void;
  setStayZonePreferences: (prefs: StayZonePreferences) => void;
  confirmStayZone: (zoneId: string) => void;
  rejectStayZone: (zoneId: string) => void;
  /** Returns hotel id on success (intel lock and/or itinerary day-loop). */
  addHotelFromZone: (zoneId: string, input: AddHotelFromZoneInput) => string | null;
  /** P112: lock hotel without zone_id (name-search path). */
  addStandaloneHotel: (input: AddStandaloneHotelInput) => string | null;
  removeHotelStay: (hotelId: string) => void;
  setSelectedStayZoneId: (zoneId: string | null) => void;
  setStayHotelMapPins: (pins: StayHotelMapPin[]) => void;
  requestStayHotelMapPinPick: (pinId: string) => void;
  clearStayHotelMapPinPick: () => void;
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

/** 总览 / 地图浏览时折叠左栏；编辑/选点/机酒/Activity 时展开（UX-CHAT-08 · P74） */
export function selectLeftPanelCollapsed(state: PlanState): boolean {
  // P104: 右栏已折叠时左栏必须展开，避免双折叠空屏
  if (selectPreviewCollapsed(state)) return false;
  if (state.editorTarget) return false;
  if (state.mapPickNodeId) return false;
  if (state.chatActivity) return false;
  if (state.leftPanelMode === 'flight' || state.leftPanelMode === 'stay') return false;
  // P74: 地图上看酒店/节点编辑时保持左栏，避免「在地图查看并编辑」像无反应
  if (state.leftPanelMode === 'form' && (state.selectedNodeId || state.selectedEdgeId)) {
    return false;
  }
  if (state.leftPanelMode === 'evidence') return false;
  if (state.graphViewMode === 'overview') return true;
  if (state.activeView === 'map') return true;
  return false;
}

/** UX-14：无路线图时折叠右侧预览；有 itinerary 或住宿面板内「有可展示内容」时展开 */
export function selectPreviewCollapsed(state: PlanState): boolean {
  const itinerary = selectActiveItinerary(state);
  const hasItinerary = Boolean(itinerary?.days?.length);
  if (hasItinerary) return false;
  // P104: 生成前片区/酒店图仅住宿面板可用；回对话等板块必须折叠
  if (state.leftPanelMode !== 'stay') return true;
  if (!state.previewExpandedWithoutItinerary) return true;
  // P103: 仅展开标志不够——无片区 geometry / 酒店钉时仍折叠，避免 EmptyPreview 挤对话
  const plan = selectActivePlan(state);
  const hasStayGeometry = (plan.travel_intel.recommended_stay_zones ?? []).some((z) =>
    Boolean(z.geometry),
  );
  const hasHotelPins = state.stayHotelMapPins.length > 0;
  return !(hasStayGeometry || hasHotelPins);
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
  const tr = get().getActivePlan().trip_request;
  void geocodeItineraryNodesStream(
    itinerary,
    dest,
    {
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
    },
    { free_text: tr.free_text ?? '', notes: tr.notes ?? '' },
  )
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
    stayHotelMapPins: [],
    stayHotelMapPinPickId: null,
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
          // error：generateItinerary 已 toast 真实 detail，此处不再二次提示
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
      if (mode !== 'optimize' && !hasLockedHotel(p.travel_intel.hotels)) {
        useToastStore
          .getState()
          .show('请先在住宿面板锁定具体酒店（名称+位置）后再生成玩法', 'warning');
        return 'blocked';
      }

      const hasFlights = p.travel_intel.flights.length > 0;
      set({
        isGeneratingItinerary: true,
        generationProgress: { phase: 'evidence', llmPreview: '' },
        chatActivity: createGenerateActivity(hasFlights),
        leftPanelMode: 'chat',
      });
      try {
        const userEvidence = (p.evidence_link_modules ?? [])
          .filter((m) => m.status === 'ok' && m.result)
          .map((m) => m.result!)
          .slice(0, 5);
        const { itinerary, llmLatencyMs } = await generateItineraryStream(p.trip_request, {
          geocode: false,
          travel_intel: p.travel_intel,
          mode,
          current_itinerary:
            mode === 'optimize' || mode === 'regenerate' ? p.itinerary : null,
          user_evidence: userEvidence.length ? userEvidence : null,
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
            if (evt.step === 'weather') {
              set((s) => ({
                generationProgress: {
                  ...s.generationProgress,
                  phase: 'weather',
                },
                chatActivity:
                  s.chatActivity?.op === 'generate'
                    ? patchActivityStep(s.chatActivity, 'weather', {
                        status: evt.status === 'done' ? 'done' : 'running',
                        detail:
                          evt.status === 'done'
                            ? evt.count
                              ? `${evt.count} 天预报`
                              : '无预报（跳过）'
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
              return;
            }
            if (evt.step === 'validate') {
              set((s) => ({
                generationProgress: {
                  ...s.generationProgress,
                  phase: 'validate',
                },
                chatActivity:
                  s.chatActivity?.op === 'generate'
                    ? patchActivityStep(s.chatActivity, 'generate_llm', {
                        status: 'running',
                        detail:
                          evt.status === 'fixing'
                            ? '输出不完整，正在修复…'
                            : '校验行程结构…',
                      })
                    : s.chatActivity,
              }));
            }
          },
        });
        set((s) =>
          updateActivePlan(s, (plan) => {
            const nextItinerary = syncItineraryMeta(itinerary, plan.trip_request);
            // P80: keep Stay panel hotels aligned with overnight nodes after generate
            const travel_intel = rebindHotelsAfterGenerate(plan.travel_intel, nextItinerary);
            return {
              ...plan,
              itinerary: nextItinerary,
              travel_intel,
            };
          }),
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
      } catch (err) {
        // P91: 禁止失败静默 Mock——露出真实错误便于检索（与 llm-api-engineering 一致）
        const detail =
          err instanceof Error && err.message.trim()
            ? err.message.trim()
            : '行程生成失败，请稍后重试';
        const short = detail.length > 320 ? `${detail.slice(0, 320)}…` : detail;
        settleChatActivity(get, set, short);
        set({ isGeneratingItinerary: false, generationProgress: idleProgress });
        useToastStore.getState().show(short, 'error');
        return 'error';
      }
    },

    addEvidenceLink: (url) => {
      const MAX = 5;
      const plan = get().getActivePlan();
      const modules = plan.evidence_link_modules ?? [];
      if (modules.length >= MAX) {
        useToastStore.getState().show(`最多添加 ${MAX} 条印证链接`, 'warning');
        return null;
      }
      const id = crypto.randomUUID();
      const mod: EvidenceLinkModule = {
        id,
        url: (url ?? '').trim(),
        status: 'idle',
      };
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          evidence_link_modules: [...(p.evidence_link_modules ?? []), mod],
        })),
      );
      return id;
    },

    removeEvidenceLink: (moduleId) => {
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          evidence_link_modules: (p.evidence_link_modules ?? []).filter((m) => m.id !== moduleId),
        })),
      );
    },

    updateEvidenceLinkUrl: (moduleId, url) => {
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          evidence_link_modules: (p.evidence_link_modules ?? []).map((m) =>
            m.id === moduleId
              ? {
                  ...m,
                  url,
                  status: m.status === 'ok' || m.status === 'error' ? 'idle' : m.status,
                  error: undefined,
                  result: undefined,
                  fetchedAt: undefined,
                }
              : m,
          ),
        })),
      );
    },

    fetchEvidenceLink: async (moduleId) => {
      const plan = get().getActivePlan();
      const mod = (plan.evidence_link_modules ?? []).find((m) => m.id === moduleId);
      if (!mod) return false;
      const checked = validateEvidenceUrl(mod.url);
      if (!checked.ok) {
        useToastStore.getState().show(checked.error, 'warning');
        set((s) =>
          updateActivePlan(s, (p) => ({
            ...p,
            evidence_link_modules: (p.evidence_link_modules ?? []).map((m) =>
              m.id === moduleId
                ? { ...m, status: 'error' as const, error: checked.error, result: undefined }
                : m,
            ),
          })),
        );
        return false;
      }
      const url = checked.url;
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          evidence_link_modules: (p.evidence_link_modules ?? []).map((m) =>
            m.id === moduleId
              ? { ...m, url, status: 'loading' as const, error: undefined }
              : m,
          ),
        })),
      );
      try {
        const res = await fetchEvidenceFromLink(url, {
          destination: plan.trip_request.destination || null,
        });
        if (!res.ok || !res.item) {
          const err = res.error || '检索失败';
          set((s) =>
            updateActivePlan(s, (p) => ({
              ...p,
              evidence_link_modules: (p.evidence_link_modules ?? []).map((m) =>
                m.id === moduleId
                  ? { ...m, status: 'error' as const, error: err, result: undefined }
                  : m,
              ),
            })),
          );
          return false;
        }
        set((s) =>
          updateActivePlan(s, (p) => ({
            ...p,
            evidence_link_modules: (p.evidence_link_modules ?? []).map((m) =>
              m.id === moduleId
                ? {
                    ...m,
                    status: 'ok' as const,
                    error: undefined,
                    result: res.item!,
                    fetchedAt: new Date().toISOString(),
                    url: res.item!.url || m.url,
                  }
                : m,
            ),
          })),
        );
        if (res.fromCache) {
          useToastStore.getState().show('已用本地缓存（相同链接不重复请求）', 'info');
        }
        return true;
      } catch (err) {
        const msg =
          err instanceof Error && err.message.trim()
            ? err.message.trim()
            : '检索失败，请稍后重试';
        set((s) =>
          updateActivePlan(s, (p) => ({
            ...p,
            evidence_link_modules: (p.evidence_link_modules ?? []).map((m) =>
              m.id === moduleId
                ? { ...m, status: 'error' as const, error: msg, result: undefined }
                : m,
            ),
          })),
        );
        return false;
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
        '航班已确认。请继续确认住宿片区并锁定具体酒店，再生成玩法。',
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
        const hasItinerary = Boolean(selectActiveItinerary(s)?.days?.length);
        // P97: 生成前不因推荐片区强开空白地图；有行程时仍展开预览（UX-14-05）
        if (hasGeometry && hasItinerary) {
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
        '住宿片区已确认。请在片区内锁定具体酒店后，再生成玩法（不会因改机酒自动重生成）。',
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
      const zone = (plan.travel_intel.recommended_stay_zones ?? []).find(
        (z) => z.id === zoneId,
      );
      if (!zone || zone.status !== 'confirmed') {
        useToastStore.getState().show('请先确认住宿片区', 'warning');
        return null;
      }

      const prev = plan.travel_intel.hotels.find((h) => h.zone_id === zoneId);
      const sequence =
        prev?.sequence ??
        (plan.travel_intel.hotels.length > 0
          ? Math.max(...plan.travel_intel.hotels.map((h) => h.sequence)) + 1
          : 1);

      let hotel = hotelFromZoneInput(zone, input, {
        sequence,
        previousId: prev?.id,
      });

      const itinerary = plan.itinerary;
      const label = input.name.trim() || '酒店';

      // Pre-generate: lock into travel_intel only (P88)
      if (!itinerary?.days?.length) {
        if (input.pendingMapPick) {
          useToastStore
            .getState()
            .show('生成前请选择带坐标的酒店，或手输名称并完成地理编码', 'warning');
          return null;
        }
        set((s) =>
          updateActivePlan(s, (p) => ({
            ...p,
            travel_intel: syncTravelIntelStatus({
              ...p.travel_intel,
              hotels: [
                ...p.travel_intel.hotels.filter((h) => h.zone_id !== zoneId),
                hotel,
              ],
            }),
          })),
        );
        useToastStore.getState().show(`已锁定酒店「${label}」，可生成玩法`, 'info');
        get().addChatMessage(
          'assistant',
          `已锁定住宿「${label}」。确认航班与酒店后，可点「生成玩法」；生成后将按日闭环写入路线图。`,
        );
        return hotel.id;
      }

      get().recordItineraryHistory();
      const hotels = [
        ...plan.travel_intel.hotels.filter((h) => h.zone_id !== zoneId),
        hotel,
      ];
      const zones = plan.travel_intel.recommended_stay_zones ?? [];
      const { itinerary: looped, bindings } = applyHotelDayLoop(
        itinerary,
        hotels,
        zones,
        plan.travel_intel.flights,
      );
      const primaryBind =
        bindings.find((b) => b.hotel_id === hotel.id) ?? bindings[0];
      if (primaryBind) {
        hotel = { ...hotel, itinerary_node_id: primaryBind.node_id };
      }

      const bindDay =
        primaryBind != null
          ? Math.max(0, (primaryBind.day_index || 1) - 1)
          : 0;

      set((s) => ({
        ...updateActivePlan(s, (p) => ({
          ...p,
          itinerary: {
            ...looped,
            meta: {
              ...looped.meta,
              hotel_bindings: bindings,
            },
          },
          travel_intel: syncTravelIntelStatus({
            ...p.travel_intel,
            hotels: [
              ...p.travel_intel.hotels.filter((h) => h.zone_id !== zoneId),
              hotel,
            ],
          }),
        })),
        selectedNodeId: hotel.itinerary_node_id ?? s.selectedNodeId,
        activeDayIndex: bindDay,
        leftPanelMode: input.pendingMapPick ? 'form' : s.leftPanelMode,
        previewExpandedWithoutItinerary: true,
        activeView: 'map' as const,
      }));

      if (input.pendingMapPick && hotel.itinerary_node_id) {
        get().startMapPick(hotel.itinerary_node_id);
      }

      useToastStore.getState().show(
        input.pendingMapPick
          ? `已替换为「${label}」，请在地图点选位置`
          : `已锁定并更新日闭环酒店「${label}」`,
        'info',
      );
      get().addChatMessage(
        'assistant',
        input.pendingMapPick
          ? `已将「${label}」设为住宿锚点，请在地图上点选精确位置。`
          : `已将「${label}」写入每日酒店闭环；若餐饮动线需跟着换片区，可点「优化适配」。`,
      );

      return hotel.id;
    },

    addStandaloneHotel: (input) => {
      const plan = get().getActivePlan();
      const tr = plan.trip_request;
      const zones = plan.travel_intel.recommended_stay_zones ?? [];
      const dateHint =
        zones.find((z) => z.status === 'confirmed') ??
        zones.find((z) => z.status === 'proposed');
      const check_in =
        input.check_in?.trim() ||
        dateHint?.check_in ||
        tr.date_start ||
        new Date().toISOString().slice(0, 10);
      const check_out =
        input.check_out?.trim() ||
        dateHint?.check_out ||
        tr.date_end ||
        check_in;
      const city =
        input.city?.trim() ||
        dateHint?.city ||
        tr.destination?.trim() ||
        '目的地';

      const prev = plan.travel_intel.hotels.find(isStandaloneHotel);
      const sequence =
        prev?.sequence ??
        (plan.travel_intel.hotels.length > 0
          ? Math.max(...plan.travel_intel.hotels.map((h) => h.sequence)) + 1
          : 1);

      let hotel = hotelFromStandaloneInput(
        {
          name: input.name,
          lat: input.lat,
          lng: input.lng,
          address: input.address,
          city,
          check_in,
          check_out,
        },
        { sequence, previousId: prev?.id },
      );

      const itinerary = plan.itinerary;
      const label = input.name.trim() || '酒店';
      const nextHotels = [
        ...plan.travel_intel.hotels.filter((h) => !isStandaloneHotel(h)),
        hotel,
      ];

      if (!itinerary?.days?.length) {
        set((s) =>
          updateActivePlan(s, (p) => ({
            ...p,
            travel_intel: syncTravelIntelStatus({
              ...p.travel_intel,
              hotels: [
                ...p.travel_intel.hotels.filter((h) => !isStandaloneHotel(h)),
                hotel,
              ],
            }),
          })),
        );
        useToastStore.getState().show(`已锁定酒店「${label}」，可生成玩法`, 'info');
        get().addChatMessage(
          'assistant',
          `已锁定住宿「${label}」（未绑定片区）。确认航班与酒店后，可点「生成玩法」。`,
        );
        return hotel.id;
      }

      get().recordItineraryHistory();
      const { itinerary: looped, bindings } = applyHotelDayLoop(
        itinerary,
        nextHotels,
        zones,
        plan.travel_intel.flights,
      );
      const primaryBind =
        bindings.find((b) => b.hotel_id === hotel.id) ?? bindings[0];
      if (primaryBind) {
        hotel = { ...hotel, itinerary_node_id: primaryBind.node_id };
      }
      const bindDay =
        primaryBind != null
          ? Math.max(0, (primaryBind.day_index || 1) - 1)
          : 0;

      set((s) => ({
        ...updateActivePlan(s, (p) => ({
          ...p,
          itinerary: {
            ...looped,
            meta: {
              ...looped.meta,
              hotel_bindings: bindings,
            },
          },
          travel_intel: syncTravelIntelStatus({
            ...p.travel_intel,
            hotels: [
              ...p.travel_intel.hotels.filter((h) => !isStandaloneHotel(h)),
              hotel,
            ],
          }),
        })),
        selectedNodeId: hotel.itinerary_node_id ?? s.selectedNodeId,
        activeDayIndex: bindDay,
        previewExpandedWithoutItinerary: true,
        activeView: 'map' as const,
      }));

      useToastStore.getState().show(`已锁定并更新日闭环酒店「${label}」`, 'info');
      get().addChatMessage(
        'assistant',
        `已将「${label}」写入每日酒店闭环（未绑定片区）。`,
      );
      return hotel.id;
    },

    removeHotelStay: (hotelId) => {
      const plan = get().getActivePlan();
      const hotel = plan.travel_intel.hotels.find((h) => h.id === hotelId);
      if (!hotel) return;

      const remaining = plan.travel_intel.hotels.filter((h) => h.id !== hotelId);
      const zones = plan.travel_intel.recommended_stay_zones ?? [];

      if (plan.itinerary?.days?.length) {
        get().recordItineraryHistory();
        const { itinerary: looped } = applyHotelDayLoop(
          plan.itinerary,
          remaining,
          zones,
          plan.travel_intel.flights,
        );
        // If no hotels left, strip hotel nodes left from previous loop
        let nextItinerary = looped;
        if (!remaining.length) {
          nextItinerary = {
            ...looped,
            days: looped.days.map((day) => {
              const nodes = day.nodes.filter((n) => n.category !== 'hotel');
              const idSet = new Set(nodes.map((n) => n.id));
              const edges = (day.edges ?? []).filter(
                (e) => idSet.has(e.from) && idSet.has(e.to),
              );
              return { ...day, nodes, edges };
            }),
            meta: {
              ...looped.meta,
              hotel_bindings: [],
            },
          };
        }
        set((s) => ({
          ...updateActivePlan(s, (p) => ({
            ...p,
            itinerary: nextItinerary,
            travel_intel: removeHotelFromIntel(p.travel_intel, hotelId),
          })),
          selectedNodeId:
            s.selectedNodeId &&
            plan.itinerary!.days.some((d) =>
              d.nodes.some(
                (n) =>
                  n.id === s.selectedNodeId &&
                  n.category === 'hotel' &&
                  n.name.trim().toLowerCase() === hotel.name.trim().toLowerCase(),
              ),
            )
              ? null
              : s.selectedNodeId,
        }));
        return;
      }

      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          travel_intel: removeHotelFromIntel(p.travel_intel, hotelId),
        })),
      );
    },

    setSelectedStayZoneId: (zoneId) => set({ selectedStayZoneId: zoneId }),
    setStayHotelMapPins: (pins) => set({ stayHotelMapPins: pins }),
    requestStayHotelMapPinPick: (pinId) => set({ stayHotelMapPinPickId: pinId }),
    clearStayHotelMapPinPick: () => set({ stayHotelMapPinPickId: null }),

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

    setLeftPanelMode: (mode) =>
      set((s) => {
        const leavingStay = s.leftPanelMode === 'stay' && mode !== 'stay';
        const hasItinerary = Boolean(selectActiveItinerary(s)?.days?.length);
        // P104: 离开住宿回对话/机票等时，无玩法则收起片区地图并清钉
        // 同时离开 map 视图，否则左栏仍按 activeView=map 折叠 → 双折叠空屏
        if (leavingStay && !hasItinerary) {
          return {
            leftPanelMode: mode,
            previewExpandedWithoutItinerary: false,
            stayHotelMapPins: [],
            activeView: 'graph' as const,
          };
        }
        return { leftPanelMode: mode };
      }),
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
