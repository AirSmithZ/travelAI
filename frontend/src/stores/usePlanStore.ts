import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Itinerary, ItineraryNode, GraphViewMode, ViewTab, DayPlan, DayWeather } from '../types/itinerary';
import type { FormPatch, TravelPlan, ChatMode } from '../types/travelPlan';
import type { TripRequest } from '../types/tripRequest';
import type { FlightLegRole, FlightSearchSession, ManualFlightLegInput } from '../types/travelIntel';
import {
  flightLegFromManualInput,
  flightLegsFromQuote,
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
import type { RecommendedStayZone, StayZonePreferences } from '../types/stayZone';
import { addHotelNodeForZone } from '../utils/hotelNodeMutations';
import {
  hotelFromZoneAndNode,
  patchStayZones,
  removeHotelByNodeId,
  removeHotelFromIntel,
  syncIntelHotelFromNode,
} from '../utils/hotelIntelSync';

export type GenerationPhase = 'idle' | 'llm' | 'geocode';

export interface GenerationProgress {
  phase: GenerationPhase;
  llmLatencyMs?: number | null;
  /** generate 流式：从部分 JSON 提取的 title / day label 预览 */
  llmPreview?: string;
  geocodeDone?: number;
  geocodeTotal?: number;
}

const idleProgress: GenerationProgress = { phase: 'idle' };

export type EditorTarget =
  | { kind: 'form'; focus: 'day'; dayIndex: number }
  | { kind: 'form'; focus: 'region'; regionName: string };

export type LeftPanelMode = 'chat' | 'flight' | 'stay' | 'form';

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
  generateItinerary: () => Promise<'api' | 'mock'>;
  maybeAutoGenerateItinerary: () => Promise<'api' | 'mock' | 'skipped'>;
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

/** 总览 / 地图浏览时折叠左栏；编辑表头/区域或地图选点时展开 */
export function selectLeftPanelCollapsed(state: PlanState): boolean {
  if (state.editorTarget) return false;
  if (state.mapPickNodeId) return false;
  if (state.graphViewMode === 'overview') return true;
  if (state.activeView === 'map') return true;
  return false;
}

function runBackgroundGeocode(
  set: (partial: Partial<PlanState> | ((s: PlanState) => Partial<PlanState>)) => void,
  itinerary: Itinerary,
  destination: string,
  llmLatencyMs?: number | null,
) {
  const dest = destination.trim();
  if (!dest) return;
  set({
    isGeocodingItinerary: true,
    generationProgress: {
      phase: 'geocode',
      llmLatencyMs,
      geocodeDone: 0,
      geocodeTotal: 0,
    },
  });
  void geocodeItineraryNodesStream(itinerary, dest, {
    onProgress: ({ done, total }) => {
      set((s) => ({
        generationProgress: {
          phase: 'geocode',
          llmLatencyMs: s.generationProgress.llmLatencyMs ?? llmLatencyMs,
          geocodeDone: done,
          geocodeTotal: total,
        },
      }));
    },
  })
    .then((geocoded) => {
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          itinerary: syncItineraryMeta(geocoded, p.trip_request),
        })),
      );
    })
    .catch(() => {
      useToastStore.getState().show(
        '坐标补全失败，可在节点编辑器中手动搜索',
        'warning',
      );
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
    mapPickNodeId: null,
    selectedStayZoneId: null,
    exportOverviewCapture: false,
    overviewColumnWidths: {},
    isGeneratingItinerary: false,
    isGeocodingItinerary: false,
    generationProgress: idleProgress,
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
          runBackgroundGeocode(set, itinerary, destination);
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

    generateItinerary: async () => {
      set({ isGeneratingItinerary: true, generationProgress: { phase: 'llm', llmPreview: '' } });
      const p = get().getActivePlan();
      if (p.travel_intel.flights.length === 0) {
        useToastStore.getState().show('尚未确认航班；玩法行程将不含航班时刻约束', 'warning');
      }
      try {
        const { itinerary, llmLatencyMs } = await generateItineraryStream(p.trip_request, {
          geocode: false,
          onDelta: (preview) => {
            set((s) => ({
              generationProgress: {
                phase: 'llm',
                llmPreview: preview,
                llmLatencyMs: s.generationProgress.llmLatencyMs,
              },
            }));
          },
          onProgress: (evt) => {
            if (evt.step === 'llm' && evt.status === 'done') {
              set((s) => ({
                generationProgress: {
                  phase: 'llm',
                  llmPreview: s.generationProgress.llmPreview,
                  llmLatencyMs: evt.latencyMs,
                },
              }));
            }
          },
        });
        set((s) =>
          updateActivePlan(s, (plan) => ({
            ...plan,
            itinerary: syncItineraryMeta(itinerary, plan.trip_request),
          })),
        );
        set({ isGeneratingItinerary: false });
        const dest = p.trip_request.destination?.trim();
        if (dest) {
          runBackgroundGeocode(set, itinerary, dest, llmLatencyMs);
        } else {
          set({ generationProgress: idleProgress });
        }
        return 'api';
      } catch {
        set((s) =>
          updateActivePlan(s, (plan) => {
            const itinerary = buildMockItinerary(plan.trip_request);
            return { ...plan, itinerary: syncItineraryMeta(itinerary, plan.trip_request) };
          }),
        );
        set({ isGeneratingItinerary: false, generationProgress: idleProgress });
        const dest = p.trip_request.destination?.trim();
        const mockItinerary = get().getItinerary();
        if (dest && mockItinerary) runBackgroundGeocode(set, mockItinerary, dest);
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
              flights,
              last_flight_search: {
                ...session,
                confirmed_quote_id: quoteId,
                hide_ranked: true,
              },
            }),
          };
        }),
      );
      set({ leftPanelMode: 'form' });
      useToastStore.getState().show(
        isRoundTrip ? '已确认往返航段，已切换到行程编辑' : '已确认航班航段，已切换到行程编辑',
        'info',
      );
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
            travel_intel: syncTravelIntelStatus({ ...p.travel_intel, flights }),
          };
        }),
      );
      set({ leftPanelMode: 'form' });
      useToastStore.getState().show('已添加航段，已切换到行程编辑', 'info');
    },

    removeFlightLeg: (legId) => {
      set((s) =>
        updateActivePlan(s, (p) => {
          const removed = p.travel_intel.flights.find((f) => f.id === legId);
          let flights = p.travel_intel.flights.filter((f) => f.id !== legId);
          if (removed?.bundle_id) {
            flights = flights.filter((f) => f.bundle_id !== removed.bundle_id);
          }

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
      set((s) =>
        updateActivePlan(s, (p) => ({
          ...p,
          travel_intel: syncTravelIntelStatus({
            ...p.travel_intel,
            recommended_stay_zones: zones,
            stay_zones_fetched_at: fetchedAt,
          }),
        })),
      );
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
