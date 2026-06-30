import type { FormPatch } from '../types/travelPlan';

/** 同字段多条 set/remove 保留最后一条（设计 L15） */
export function dedupeConflictingPatches(patches: FormPatch[]): {
  patches: FormPatch[];
  conflictFields: string[];
} {
  const conflictFields: string[] = [];
  const seen = new Map<string, FormPatch>();

  for (const patch of patches) {
    if (patch.action === 'fork_plan' || patch.action === 'add_node' || patch.action === 'update_edge') {
      seen.set(`${patch.action}:${patch.id}`, patch);
      continue;
    }

    const key =
      patch.action === 'append' && patch.field_path === 'preference_tags'
        ? `${patch.action}:${patch.field_path}:${String(patch.new_value)}`
        : `${patch.action}:${patch.field_path}`;

    if (seen.has(key) && patch.action !== 'append') {
      conflictFields.push(patch.field_path);
    }
    seen.set(key, patch);
  }

  return { patches: [...seen.values()], conflictFields: [...new Set(conflictFields)] };
}
