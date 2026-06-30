import type { PlanPhase } from '../../types/travelPlan';
import { createTripRequestPatch } from '../../utils/patchSchema';

const DESTINATIONS = ['新加坡', '曼谷', '东京', '大阪', '首尔', '巴黎', '伦敦', '巴厘岛'];
const PREF_KEYWORDS = ['美食', '亲子', '徒步', '购物', '文化', '摄影', '夜生活'];

/** Phase 1b 本地演示：模拟 LLM 将自然语言解析为 FormPatch（确认后才写入） */
export function parseDemoChat(
  text: string,
  phase: PlanPhase,
): { reply: string; patches: ReturnType<typeof createTripRequestPatch>[] } {
  const patches: ReturnType<typeof createTripRequestPatch>[] = [];

  const forkMatch = text.match(/改去|换成|不去.+改|切换到?\s*(.+?)(?:了|$)/);
  if (forkMatch) {
    const dest = forkMatch[1]?.replace(/[了，。]/g, '').trim();
    if (dest && dest.length <= 20) {
      return {
        reply: `好的，我可以为「${dest}」创建新的旅行计划，请确认：`,
        patches: [
          {
            id: crypto.randomUUID(),
            target: 'trip_request' as const,
            action: 'fork_plan' as const,
            field_path: 'destination',
            label: '目的地',
            new_value: dest,
            summary: `检测到目的地变更：${dest}`,
            fork_plan: {
              destination: dest,
              inherit_fields: ['preference_tags', 'travelers', 'budget_level'],
            },
          },
        ],
      };
    }
  }

  if (phase === 'detailed') {
    const forkMatch = text.match(/改去|换成|不去.+改|切换到?\s*(.+?)(?:了|$)/);
    if (forkMatch) {
      const dest = forkMatch[1]?.replace(/[了，。]/g, '').trim();
      if (dest && dest.length <= 20) {
        return {
          reply: `好的，我可以为「${dest}」创建新的旅行计划，请确认：`,
          patches: [
            {
              id: crypto.randomUUID(),
              target: 'trip_request' as const,
              action: 'fork_plan' as const,
              field_path: 'destination',
              label: '目的地',
              new_value: dest,
              summary: `检测到目的地变更：${dest}`,
              fork_plan: {
                destination: dest,
                inherit_fields: ['preference_tags', 'travelers', 'budget_level'],
              },
            },
          ],
        };
      }
    }

    const dayMatch = text.match(/第\s*(\d+)\s*天/);
    const addMatch = text.match(/(?:加|新增|安排|插入)\s*(.+?)(?:景点|餐厅|酒店|活动)?(?:[，。]|$)/);
    if (dayMatch && addMatch) {
      const dayIndex = Number(dayMatch[1]);
      const name = addMatch[1].replace(/[了，。]/g, '').trim();
      if (name && name.length <= 30) {
        const connectAfter = `d${dayIndex}-n${dayIndex === 1 ? 5 : 3}`;
        return {
          reply: `可以在第 ${dayIndex} 天新增「${name}」，请确认：`,
          patches: [
            {
              id: crypto.randomUUID(),
              target: 'node' as const,
              action: 'add_node' as const,
              field_path: `days[${dayIndex}].nodes`,
              label: name,
              new_value: {
                day_index: dayIndex,
                node: {
                  name,
                  category: 'attraction' as const,
                  lat: 1.29,
                  lng: 103.86,
                  is_optional: false,
                },
                connect_after: connectAfter,
              },
              summary: `第 ${dayIndex} 天新增：${name}`,
            },
          ],
        };
      }
    }

    return {
      reply: '收到。可尝试「第 2 天加一个滨海湾花园」；换目的地请说「改去曼谷」。',
      patches: [],
    };
  }

  for (const dest of DESTINATIONS) {
    if (text.includes(dest)) {
      patches.push(createTripRequestPatch('set', 'destination', dest, `目的地：${dest}`));
      break;
    }
  }

  const dayMatch = text.match(/(\d+)\s*天/);
  if (dayMatch) {
    patches.push(
      createTripRequestPatch('set', 'day_count', Number(dayMatch[1]), `行程天数：${dayMatch[1]} 天`),
    );
  }

  const travelersMatch = text.match(/(\d+)\s*人/);
  if (travelersMatch) {
    patches.push(
      createTripRequestPatch(
        'set',
        'travelers',
        Number(travelersMatch[1]),
        `出行人数：${travelersMatch[1]} 人`,
      ),
    );
  }

  for (const tag of PREF_KEYWORDS) {
    if (text.includes(tag)) {
      patches.push(createTripRequestPatch('append', 'preference_tags', tag, `添加偏好：${tag}`));
    }
  }

  if (text.length > 10) {
    patches.push(createTripRequestPatch('set', 'free_text', text, '保存行程描述（供生成使用）'));
  }

  if (patches.length === 0) {
    return {
      reply: '请描述目的地、天数和偏好，例如：「新加坡 4 天，美食 + 亲子」。确认解析结果后可点击顶部「生成行程」。',
      patches: [],
    };
  }

  return {
    reply: `已解析 ${patches.length} 项信息，请确认后写入计划；确认后将自动生成路线图：`,
    patches,
  };
}

export function getChatModeLabel(phase: PlanPhase): string {
  return phase === 'detailed' ? 'supplement · 行程补充' : 'global · 需求收集';
}
