import type { DayWeather, Itinerary, ItineraryEdge, ItineraryNode } from '../types/itinerary';
import type { FormPatch } from '../types/travelPlan';
import {
  addDayToItinerary,
  addNodeToItinerary,
  removeNodeFromItinerary,
  type CreateDayOptions,
  type NodeInsertOptions,
} from './itineraryMutations';
import {
  updateCrossDayEdgeInItinerary,
  updateEdgeInItinerary,
} from './edgeMutations';
import { renameRegionInItinerary } from './regionMutations';
import { weatherIconLabel } from './formatWeather';

export interface AddNodePayload {
  day_index: number;
  node: Partial<ItineraryNode> & { name: string };
  connect_after?: string;
  insert_before?: string;
  position?: 'start' | 'end';
}

export interface UpdateEdgePayload {
  edge_id: string;
  day_index?: number;
  patch: Partial<ItineraryEdge>;
}

export interface AddDayPayload {
  insert_index?: number;
  label?: string;
  region?: string;
  date?: string;
}

function applyAddDay(itinerary: Itinerary, patch: FormPatch): Itinerary {
  const payload = (patch.new_value ?? {}) as AddDayPayload;
  const insertIndex =
    payload.insert_index != null ? Math.max(0, payload.insert_index - 1) : undefined;
  const options: CreateDayOptions = {
    insertIndex,
    label: payload.label,
    region: payload.region,
    date: payload.date,
  };
  return addDayToItinerary(itinerary, options);
}

function applyAddNode(itinerary: Itinerary, patch: FormPatch): Itinerary {
  const payload = patch.new_value as AddNodePayload;
  const dayIdx = (payload.day_index ?? 1) - 1;
  if (dayIdx < 0 || dayIdx >= itinerary.days.length) return itinerary;

  const options: NodeInsertOptions = {
    partial: payload.node,
    insertAfter: payload.connect_after,
    insertBefore: payload.insert_before,
    position: payload.position,
  };

  return addNodeToItinerary(itinerary, dayIdx, options).itinerary;
}

function applyNodeSet(itinerary: Itinerary, patch: FormPatch): Itinerary {
  const m = patch.field_path.match(/^days\[(\d+)\]\.nodes\[([^\]]+)\](?:\.(.+))?$/);
  if (!m) return itinerary;

  const dayIdx = parseInt(m[1], 10) - 1;
  const nodeId = m[2];
  const field = m[3];

  if (dayIdx < 0 || dayIdx >= itinerary.days.length) return itinerary;

  const days = itinerary.days.map((day, i) => {
    if (i !== dayIdx) return day;
    return {
      ...day,
      nodes: day.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        if (!field) return { ...n, ...(patch.new_value as Partial<ItineraryNode>) };
        return { ...n, [field]: patch.new_value };
      }),
    };
  });

  return { ...itinerary, days };
}

function applyUpdateEdge(itinerary: Itinerary, patch: FormPatch): Itinerary {
  const payload = patch.new_value as UpdateEdgePayload;
  if (!payload?.edge_id || !payload.patch) return itinerary;

  if (patch.field_path.startsWith('cross_day_edges')) {
    return updateCrossDayEdgeInItinerary(itinerary, payload.edge_id, payload.patch);
  }

  const m = patch.field_path.match(/^days\[(\d+)\]\.edges\[([^\]]+)\]$/);
  if (!m) return itinerary;
  const dayIdx = parseInt(m[1], 10) - 1;
  if (dayIdx < 0 || dayIdx >= itinerary.days.length) return itinerary;

  return updateEdgeInItinerary(itinerary, dayIdx, payload.edge_id, payload.patch);
}

function applyDayWeatherSet(itinerary: Itinerary, patch: FormPatch): Itinerary {
  const m = patch.field_path.match(/^days\[(\d+)\]\.weather(?:\.(.+))?$/);
  if (!m?.[2]) return itinerary;

  const dayIdx = parseInt(m[1], 10) - 1;
  const field = m[2];
  if (dayIdx < 0 || dayIdx >= itinerary.days.length) return itinerary;

  const days = itinerary.days.map((day, i) => {
    if (i !== dayIdx) return day;
    const weather: DayWeather = {
      temp_min: 22,
      temp_max: 30,
      icon: 'cloudy',
      description: weatherIconLabel('cloudy'),
      ...day.weather,
      source: 'manual',
      [field]: patch.new_value,
    };
    if (field === 'icon') {
      weather.description = weatherIconLabel(weather.icon);
    }
    return { ...day, weather };
  });

  return { ...itinerary, days };
}

export function applyItineraryPatch(itinerary: Itinerary, patch: FormPatch): Itinerary {
  if (patch.action === 'add_node' && patch.target === 'node') {
    return applyAddNode(itinerary, patch);
  }

  if (patch.action === 'add_day' && patch.target === 'day') {
    return applyAddDay(itinerary, patch);
  }

  if (
    patch.action === 'set' &&
    patch.target === 'itinerary' &&
    patch.field_path === 'rename_region'
  ) {
    const payload = patch.new_value as { old_name?: string; new_name?: string };
    const oldName = payload?.old_name?.trim();
    const newName = payload?.new_name?.trim();
    if (!oldName || !newName) return itinerary;
    return renameRegionInItinerary(itinerary, oldName, newName);
  }

  if (patch.action === 'update_edge' && patch.target === 'edge') {
    return applyUpdateEdge(itinerary, patch);
  }

  if (patch.action === 'set' && patch.target === 'node') {
    return applyNodeSet(itinerary, patch);
  }

  if (patch.action === 'set' && patch.target === 'day') {
    return applyDayWeatherSet(itinerary, patch);
  }

  if (patch.action === 'remove' && patch.target === 'node') {
    const m = patch.field_path.match(/^days\[(\d+)\]\.nodes\[([^\]]+)\]$/);
    if (!m) return itinerary;
    const dayIdx = parseInt(m[1], 10) - 1;
    const nodeId = m[2];
    return removeNodeFromItinerary(itinerary, dayIdx, nodeId);
  }

  return itinerary;
}
