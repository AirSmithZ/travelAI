import type { ChatMessage } from '../types/travelPlan';

/** 传给 parse API 的历史：不含当前轮 user 消息（避免与 message 字段重复，P39） */
export function chatHistoryForParse(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) return [];
  const last = messages[messages.length - 1];
  const withoutCurrent =
    last?.role === 'user' ? messages.slice(0, -1) : messages;
  return withoutCurrent.slice(-20);
}

/** 确认/忽略 patch 后同步消息上的 patch_status（P69） */
export function syncMessagesAfterPatchAction(
  messages: ChatMessage[],
  patchIds: Set<string>,
  action: 'applied' | 'rejected',
): ChatMessage[] {
  return messages.map((msg) => {
    if (!msg.patches?.length) return msg;
    const hasMatch = msg.patches.some((p) => patchIds.has(p.id));
    if (!hasMatch) return msg;

    const remaining = msg.patches.filter((p) => !patchIds.has(p.id));
    return {
      ...msg,
      patches: remaining.length > 0 ? remaining : undefined,
      patch_status: remaining.length === 0 ? action : 'pending',
    };
  });
}

/** 将 batch_id 写入最近一条带 patches 的 assistant 消息 */
export function tagLastAssistantPatches(
  messages: ChatMessage[],
  taggedPatches: ChatMessage['patches'],
): ChatMessage[] {
  if (!taggedPatches?.length) return messages;
  const msgs = [...messages];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant' && msgs[i].patches?.length) {
      msgs[i] = { ...msgs[i], patches: taggedPatches };
      break;
    }
  }
  return msgs;
}
