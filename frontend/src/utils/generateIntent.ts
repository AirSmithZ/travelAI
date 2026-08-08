/** UX-CHAT-02: detect user intent to generate itinerary / 玩法. */

const GENERATE_RE =
  /(?:帮我|请|想|要)?(?:生成|排|做|出)(?:一[个份趟])?(?:玩法|行程|路线图|日程)|开始生成|生成玩法|排行程|排玩法/;

/** Avoid false positives like「生成一张图片」without travel nouns. */
export function isGenerateIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/图片|海报|二维码|代码|报告/.test(t) && !/(玩法|行程|路线)/.test(t)) {
    return false;
  }
  return GENERATE_RE.test(t);
}
