import { snapdom } from '@zumer/snapdom';
import {
  ExportGraphError,
  downloadBlob,
  withExpandedOverviewShell,
} from './exportGraphImage';

/** 2 倍清晰度。dpr 必须单独固定为 1，否则 Retina 会再乘一次，超长图又被缩小。 */
const HIRES_SCALE = 2;
const HIRES_DPR = 1;
const HIRES_BG = '#070b10';
const HIRES_TIMEOUT_MS = 180_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new ExportGraphError(`${label}超时（${Math.round(ms / 1000)}s）`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function captureSharpPng(el: HTMLElement): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') {
    throw new ExportGraphError('当前浏览器不能编码超长 PNG，请换 Chrome');
  }

  const capture = await snapdom(el, {
    dpr: HIRES_DPR,
    embedFonts: false,
    backgroundColor: HIRES_BG,
    fast: true,
  });
  const blob = await capture.toBlob({
    format: 'png',
    scale: HIRES_SCALE,
    dpr: HIRES_DPR,
    backgroundColor: HIRES_BG,
  });
  const clamped = capture.warnings.some(
    (warning) => warning.code === 'raster-clamp' || warning.code === 'canvas-clamp',
  );
  if (clamped) {
    throw new ExportGraphError('浏览器仍把长图缩小了，没有得到 2 倍清晰度');
  }
  if (!(blob instanceof Blob) || blob.size < 32) {
    throw new ExportGraphError('高清长图没有生成');
  }
  return blob;
}

/** 总览：展开全列后由 SnapDOM 分窗编码一张 2 倍 PNG，不经过单张画布上限。 */
export async function exportOverviewSharpPng(
  shell: HTMLElement,
  layout: { width: number; height: number; railWidth: number },
  filename: string,
) {
  await withExpandedOverviewShell(shell, layout, async () => {
    const blob = await withTimeout(captureSharpPng(shell), HIRES_TIMEOUT_MS, '高清长图');
    downloadBlob(blob, filename);
  });
}

/** 单日路线图同样走 2 倍 PNG。图不大时 SnapDOM 会用浏览器自己的编码器。 */
export async function exportElementSharpPng(el: HTMLElement, filename: string) {
  const prevExporting = el.hasAttribute('data-exporting');
  el.setAttribute('data-exporting', '');
  try {
    const blob = await withTimeout(captureSharpPng(el), HIRES_TIMEOUT_MS, '高清长图');
    downloadBlob(blob, filename);
  } finally {
    if (!prevExporting) el.removeAttribute('data-exporting');
  }
}
