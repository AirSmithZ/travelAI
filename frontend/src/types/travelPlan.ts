import type { Itinerary } from './itinerary';
import type { TripRequest } from './tripRequest';

export type PlanPhase = 'empty' | 'planning' | 'detailed';

export type ChatMode = 'global' | 'supplement';

export type FormPatchAction =
  | 'set'
  | 'append'
  | 'remove'
  | 'add_node'
  | 'add_day'
  | 'update_edge'
  | 'fork_plan';

export type PatchTarget = 'trip_request' | 'itinerary' | 'node' | 'day' | 'edge';

export type PatchConfidence = 'high' | 'medium' | 'low';

/** supplement 模式当前选区（设计 L13） */
export interface ChatParseSelection {
  day_index: number;
  node_id?: string;
  edge_id?: string;
  node_name?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  chat_mode?: ChatMode;
  patches?: FormPatch[];
  patch_status?: 'pending' | 'applied' | 'rejected';
}

/** 对齐设计文档 §3.7 FormPatch */
export interface FormPatch {
  id: string;
  target: PatchTarget;
  action: FormPatchAction;
  field_path: string;
  label: string;
  old_value?: unknown;
  new_value: unknown;
  summary: string;
  confidence?: PatchConfidence;
  batch_id?: string;
  fork_plan?: {
    destination: string;
    inherit_fields?: ('preference_tags' | 'travelers' | 'budget_level')[];
  };
}

export type FormBlockId =
  | 'free_text'
  | 'destination'
  | 'date_range'
  | 'day_count'
  | 'travelers'
  | 'budget'
  | 'preferences'
  | 'notes'
  | 'node_editor';

export interface FormLayoutItem {
  id: FormBlockId;
  visible: boolean;
  collapsed: boolean;
  order: number;
}

export interface FormLayoutState {
  version: 1;
  blocks: FormLayoutItem[];
}

export interface TravelPlan {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  phase: PlanPhase;
  trip_request: TripRequest;
  itinerary: Itinerary | null;
  chat_messages: ChatMessage[];
  pending_patches: FormPatch[];
  form_layout?: FormLayoutState;
  /** 服务端最近一次 parse 使用的 chat_mode（P81） */
  last_chat_mode?: ChatMode;
}
