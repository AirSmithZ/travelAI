/** 画布上限：避免 pixelRatio:2 × 全列宽 OOM / 空白图 */

export const CANVAS_MAX_EDGE = 8192;
export const CANVAS_MAX_PIXELS = 12_000_000;

/** 超过此面积跳过网页字体嵌入（Noto SC 全量 base64 易 OOM） */
export const FONT_EMBED_MAX_AREA = 1_200_000;

export function pickExportPixelRatio(width: number, height: number): number {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  for (const ratio of [2, 1.5, 1.25, 1] as const) {
    const cw = w * ratio;
    const ch = h * ratio;
    if (cw <= CANVAS_MAX_EDGE && ch <= CANVAS_MAX_EDGE && cw * ch <= CANVAS_MAX_PIXELS) {
      return ratio;
    }
  }
  return 1;
}
