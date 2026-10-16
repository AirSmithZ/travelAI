/** NOTE-BOARD-01 / P130: derive 行前注意事项看板（非节点 tips）。 */

export type NotesBoardCategory =
  | 'visa'
  | 'customs'
  | 'packing'
  | 'safety'
  | 'culture'
  | 'money'
  | 'comms'
  | 'other';

export interface NotesBoardItem {
  id: string;
  category: NotesBoardCategory;
  text: string;
  /** low = 启发式/KB；medium = 用户原文；high = 少用 */
  confidence: 'low' | 'medium' | 'high';
  source: 'user' | 'kb' | 'evidence' | 'tips' | 'system';
}

export const NOTES_BOARD_CATEGORY_LABELS: Record<NotesBoardCategory, string> = {
  visa: '证件与入境',
  customs: '海关与申报',
  packing: '行李与物品',
  safety: '健康与安全',
  culture: '文化与礼仪',
  money: '金钱与支付',
  comms: '通讯与数字化',
  other: '其他',
};

const TIP_KEYWORDS =
  /注意|禁忌|建议带|记得带|签证|入境|海关|现金|小费|着装|插头|电压|保险|疫苗|充电宝|液体|免签|evisa|e-visa/i;

/** Thin destination KB (供参考 · low confidence). */
const DEST_KB: Array<{ match: RegExp; items: Array<{ category: NotesBoardCategory; text: string }> }> =
  [
    {
      match: /新加坡|singapore|sin\b/i,
      items: [
        { category: 'visa', text: '多数中国护照旅客可免签短期停留；以官方最新政策为准。' },
        { category: 'customs', text: '严禁携带口香糖、部分药品与管制刀具入境。' },
        { category: 'money', text: '刷卡普及；小费非必须，服务费常已含。' },
        { category: 'comms', text: '插头多为 Type G；电压 230V。' },
        { category: 'packing', text: '充电宝须随身登机；注意液体 100ml 限制。' },
      ],
    },
    {
      match: /越南|vietnam|胡志明|芽庄|岘港|河内|sgn|cxr|dad|han/i,
      items: [
        { category: 'visa', text: '入境可能需 eVisa / 落地签；出发前核验有效期与停留天数。' },
        { category: 'money', text: '现金（VND）仍常用；部分店只收现金，ATM 手续费留意。' },
        { category: 'comms', text: '常用 Grab；插头多为 Type A/C。' },
        { category: 'packing', text: '雨季备轻便雨具；海边段备防晒与驱蚊。' },
        { category: 'culture', text: '寺庙着装宜遮肩膝；左手递物在部分场合需注意。' },
      ],
    },
    {
      match: /泰国|thailand|曼谷|清迈|普吉|bkk|dmk|hkt|cnx/i,
      items: [
        { category: 'visa', text: '免签政策随政策调整；核对护照有效期与停留上限。' },
        { category: 'culture', text: '勿触碰他人头部；佛像与王室相关言论需谨慎。' },
        { category: 'money', text: '小费常见但额度不高；7-Eleven 与街边现金更方便。' },
        { category: 'packing', text: '寺庙需遮肩膝；雨季备雨具。' },
      ],
    },
    {
      match: /日本|japan|东京|大阪|京都|tyo|nrt|hnd|kix|itm/i,
      items: [
        { category: 'visa', text: '确认是否免签及停留天数；部分口岸电子化通关。' },
        { category: 'money', text: '现金仍重要；交通 IC 卡与免税手续提前了解。' },
        { category: 'comms', text: '插头 Type A/B；电压 100V（电器兼容性留意）。' },
        { category: 'culture', text: '公共交通保持安静；垃圾分类与禁烟区严格。' },
      ],
    },
  ];

function normalizeDest(s: string): string {
  return (s || '').trim();
}

function extractUserLines(text: string): string[] {
  return text
    .split(/[\n;!?。！？；]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && TIP_KEYWORDS.test(t));
}

function guessCategory(text: string): NotesBoardCategory {
  const t = text.toLowerCase();
  if (/签证|免签|护照|入境|evisa|落地签/.test(t)) return 'visa';
  if (/海关|申报|现金上限|违禁/.test(t)) return 'customs';
  if (/带|行李|充电宝|液体|衣物|雨伞|防晒|插头/.test(t)) return 'packing';
  if (/安全|保险|疫苗|急救|治安/.test(t)) return 'safety';
  if (/小费|刷卡|现金|货币|退税|atm/.test(t)) return 'money';
  if (/禁忌|着装|寺庙|礼仪|拍照/.test(t)) return 'culture';
  if (/esim|sim|翻译|grab|uber|电压|插头/.test(t)) return 'comms';
  return 'other';
}

export function buildNotesBoard(input: {
  destination?: string;
  free_text?: string;
  notes?: string;
  /** Node tips flattened */
  tipLines?: string[];
  /** Evidence titles/snippets */
  evidenceLines?: string[];
  /** Segment cities for multi-city KB */
  cities?: string[];
}): NotesBoardItem[] {
  const out: NotesBoardItem[] = [];
  const seen = new Set<string>();
  const push = (item: Omit<NotesBoardItem, 'id'> & { id?: string }) => {
    const key = `${item.category}|${item.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id: item.id || `nb_${out.length + 1}`,
      category: item.category,
      text: item.text,
      confidence: item.confidence,
      source: item.source,
    });
  };

  const userBlob = [input.free_text, input.notes].filter(Boolean).join('\n');
  for (const line of extractUserLines(userBlob)) {
    push({
      category: guessCategory(line),
      text: line,
      confidence: 'medium',
      source: 'user',
    });
  }

  for (const line of input.tipLines || []) {
    const t = line.trim();
    if (t.length < 4 || !TIP_KEYWORDS.test(t)) continue;
    push({ category: guessCategory(t), text: t, confidence: 'low', source: 'tips' });
  }

  for (const line of input.evidenceLines || []) {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t.length < 6 || !TIP_KEYWORDS.test(t)) continue;
    push({
      category: guessCategory(t),
      text: t.length > 120 ? `${t.slice(0, 120)}…` : t,
      confidence: 'low',
      source: 'evidence',
    });
  }

  const cities = [
    ...(input.cities || []),
    normalizeDest(input.destination || ''),
  ].filter(Boolean);
  const hay = cities.join(' ');
  for (const row of DEST_KB) {
    if (!row.match.test(hay)) continue;
    for (const it of row.items) {
      push({
        category: it.category,
        text: it.text,
        confidence: 'low',
        source: 'kb',
      });
    }
  }

  if (out.length === 0 && hay) {
    push({
      category: 'other',
      text: '暂无自动抽取的行前注意；可在对话补充签证/行李偏好，或生成行程后从节点 tips 汇总。',
      confidence: 'low',
      source: 'system',
    });
  }

  return out;
}

export function groupNotesBoard(
  items: NotesBoardItem[],
): Array<{ category: NotesBoardCategory; label: string; items: NotesBoardItem[] }> {
  const order: NotesBoardCategory[] = [
    'visa',
    'customs',
    'packing',
    'safety',
    'culture',
    'money',
    'comms',
    'other',
  ];
  return order
    .map((category) => ({
      category,
      label: NOTES_BOARD_CATEGORY_LABELS[category],
      items: items.filter((i) => i.category === category),
    }))
    .filter((g) => g.items.length > 0);
}
