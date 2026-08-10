import { getFontEmbedCSS, toPng } from 'html-to-image';
import {
  FONT_EMBED_MAX_AREA,
  pickExportPixelRatio,
} from './exportGraphCaptureLimits';
import { COLUMN_HEADER_HEIGHT } from './layoutOverview';

export { pickExportPixelRatio };

const FONT_EMBED_TIMEOUT_MS = 2500;
const CAPTURE_TIMEOUT_MS = 45_000;

/** 与产品深色屏显一致（信息优先：导出所见即所得） */
const EXPORT_BG = '#070b10';

/** 大图跳过 Google Font 嵌入时，仍声明系统 CJK，避免度量错乱把卡片撑破 */
const EXPORT_SYSTEM_FONT_CSS = `
* {
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif !important;
}
`;

export class ExportGraphError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExportGraphError';
  }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

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

async function resolveFontEmbedCSS(
  el: HTMLElement,
  width: number,
  height: number,
): Promise<string> {
  if (width * height > FONT_EMBED_MAX_AREA) {
    return EXPORT_SYSTEM_FONT_CSS;
  }
  try {
    const css = await withTimeout(
      getFontEmbedCSS(el),
      FONT_EMBED_TIMEOUT_MS,
      '字体嵌入',
    );
    return css ? `${css}\n${EXPORT_SYSTEM_FONT_CSS}` : EXPORT_SYSTEM_FONT_CSS;
  } catch {
    return EXPORT_SYSTEM_FONT_CSS;
  }
}

async function captureElementPng(
  el: HTMLElement,
  size: { width: number; height: number },
): Promise<string> {
  const width = Math.max(1, Math.ceil(size.width));
  const height = Math.max(1, Math.ceil(size.height));
  const pixelRatio = pickExportPixelRatio(width, height);
  const fontEmbedCSS = await resolveFontEmbedCSS(el, width, height);
  const skipRemoteFonts = width * height > FONT_EMBED_MAX_AREA;

  return withTimeout(
    toPng(el, {
      width,
      height,
      pixelRatio,
      backgroundColor: EXPORT_BG,
      cacheBust: true,
      skipFonts: skipRemoteFonts,
      fontEmbedCSS,
      style: {
        // 克隆节点脱离原 flex 容器后仍可能带上压缩后的 used height
        height: `${height}px`,
        width: `${width}px`,
        maxHeight: 'none',
        maxWidth: 'none',
        minHeight: `${height}px`,
        flex: 'none',
        overflow: 'visible',
        transform: 'none',
        fontFamily:
          '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif',
      },
    }),
    CAPTURE_TIMEOUT_MS,
    '截图',
  );
}

export async function exportElementToPng(el: HTMLElement, filename: string) {
  const prevExporting = el.hasAttribute('data-exporting');
  el.setAttribute('data-exporting', '');
  try {
    const width = Math.max(1, el.scrollWidth, el.offsetWidth);
    const height = Math.max(1, el.scrollHeight, el.offsetHeight);
    const dataUrl = await captureElementPng(el, { width, height });
    downloadDataUrl(dataUrl, filename);
  } finally {
    if (!prevExporting) el.removeAttribute('data-exporting');
  }
}

/** 等待虚拟化关闭后全列/全单元格挂载完成 */
export async function waitForOverviewExportReady(
  shell: HTMLElement,
  expectedDays: number,
  expectedRegions: number,
): Promise<void> {
  const deadline = performance.now() + 3000;
  const expectedCells = expectedDays * expectedRegions;

  while (performance.now() < deadline) {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const headerCols = shell.querySelectorAll('.overview-headers__col-wrap').length;
    const cells = shell.querySelectorAll('.overview-matrix__foreground .overview-cell').length;
    if (headerCols >= expectedDays && cells >= expectedCells) {
      if (shell.offsetWidth > 0 && shell.offsetHeight > 0) return;
    }
  }
}

function measureMatrixContentHeight(matrix: HTMLElement, minHeight: number): number {
  let height = Math.max(minHeight, matrix.scrollHeight, matrix.offsetHeight);

  matrix.querySelectorAll<HTMLElement>('.overview-cell').forEach((cell) => {
    height = Math.max(height, cell.offsetTop + cell.offsetHeight);
  });

  matrix.querySelectorAll<HTMLElement>('.overview-cell-bg').forEach((bg) => {
    height = Math.max(height, bg.offsetTop + bg.offsetHeight);
  });

  matrix.querySelectorAll<HTMLElement>('.overview-bezier-edge').forEach((edge) => {
    height = Math.max(height, edge.offsetTop + edge.offsetHeight);
  });

  const edgeLayer = matrix.querySelector('.overview-edge-layer') as HTMLElement | null;
  if (edgeLayer) {
    height = Math.max(height, edgeLayer.offsetTop + edgeLayer.offsetHeight);
  }

  return height;
}

function measureShellCaptureSize(
  shell: HTMLElement,
  fallback: { width: number; height: number },
): { width: number; height: number } {
  return {
    width: Math.max(
      fallback.width,
      shell.scrollWidth,
      shell.offsetWidth,
      Math.ceil(shell.getBoundingClientRect().width),
    ),
    height: Math.max(
      fallback.height,
      shell.scrollHeight,
      shell.offsetHeight,
      Math.ceil(shell.getBoundingClientRect().height),
    ),
  };
}

/** 展开总览壳层为完整尺寸后导出（暗色实色，与屏显一致） */
export async function exportOverviewShell(
  shell: HTMLElement,
  layout: { width: number; height: number; railWidth: number },
  filename: string,
) {
  const body = shell.querySelector('.overview-shell__body') as HTMLElement | null;
  const header = shell.querySelector('.overview-shell__header') as HTMLElement | null;
  const rail = shell.querySelector('.overview-shell__rail') as HTMLElement | null;
  const railInner = shell.querySelector('.overview-shell__rail-inner') as HTMLElement | null;
  const matrix = shell.querySelector('.overview-matrix') as HTMLElement | null;
  const legend = shell.querySelector('.overview-shell__legend') as HTMLElement | null;
  const headerInner = shell.querySelector('.overview-shell__header-inner') as HTMLElement | null;
  const overviewRoot = shell.closest('.overview-graph') as HTMLElement | null;

  const layoutBodyHeight = layout.height - COLUMN_HEADER_HEIGHT;
  const railWidth = layout.railWidth;

  const prev = {
    shellWidth: shell.style.width,
    shellHeight: shell.style.height,
    shellMinHeight: shell.style.minHeight,
    shellMaxHeight: shell.style.maxHeight,
    shellMaxWidth: shell.style.maxWidth,
    shellOverflow: shell.style.overflow,
    shellFlex: shell.style.flex,
    shellGridRows: shell.style.gridTemplateRows,
    rootOverflow: overviewRoot?.style.overflow,
    rootHeight: overviewRoot?.style.height,
    rootMinHeight: overviewRoot?.style.minHeight,
    bodyOverflow: body?.style.overflow,
    bodyWidth: body?.style.width,
    bodyHeight: body?.style.height,
    bodyMinHeight: body?.style.minHeight,
    bodyMaxHeight: body?.style.maxHeight,
    headerOverflow: header?.style.overflow,
    railOverflow: rail?.style.overflow,
    matrixWidth: matrix?.style.width,
    matrixHeight: matrix?.style.height,
    railInnerHeight: railInner?.style.height,
    scrollLeft: body?.scrollLeft ?? 0,
    scrollTop: body?.scrollTop ?? 0,
    headerInnerTransform: headerInner?.style.transform ?? '',
    railInnerTransform: railInner?.style.transform ?? '',
    dataExporting: shell.hasAttribute('data-exporting'),
  };

  shell.setAttribute('data-exporting', '');
  shell.removeAttribute('data-export-theme');

  // 关键：flex:1 + min-height:0 会把壳压回视口高度，foreignObject 只绘可视条带
  shell.style.flex = '0 0 auto';
  shell.style.width = `${layout.width}px`;
  shell.style.maxWidth = 'none';
  shell.style.maxHeight = 'none';
  shell.style.overflow = 'visible';

  if (overviewRoot) {
    overviewRoot.style.overflow = 'visible';
    overviewRoot.style.height = 'auto';
    overviewRoot.style.minHeight = '0';
  }

  if (header) {
    header.style.overflow = 'visible';
  }
  if (rail) {
    rail.style.overflow = 'visible';
  }
  if (headerInner) {
    headerInner.style.transform = 'none';
  }
  if (railInner) {
    railInner.style.transform = 'none';
  }

  if (body) {
    body.scrollLeft = 0;
    body.scrollTop = 0;
    body.style.overflow = 'visible';
    body.style.maxHeight = 'none';
    body.style.minHeight = `${layoutBodyHeight}px`;
    body.style.width = `${layout.width - railWidth}px`;
    body.style.height = `${layoutBodyHeight}px`;
  }

  if (matrix) {
    matrix.style.width = `${layout.width - railWidth}px`;
    matrix.style.height = `${layoutBodyHeight}px`;
  }
  if (railInner) {
    railInner.style.height = `${layoutBodyHeight}px`;
  }

  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const contentBodyHeight = matrix
    ? measureMatrixContentHeight(matrix, layoutBodyHeight)
    : layoutBodyHeight;
  const legendHeight = legend?.offsetHeight ?? 0;
  const totalHeight = COLUMN_HEADER_HEIGHT + contentBodyHeight + legendHeight;

  shell.style.height = `${totalHeight}px`;
  shell.style.minHeight = `${totalHeight}px`;
  shell.style.gridTemplateRows = `${COLUMN_HEADER_HEIGHT}px ${contentBodyHeight}px auto`;

  if (body) {
    body.style.height = `${contentBodyHeight}px`;
    body.style.minHeight = `${contentBodyHeight}px`;
  }
  if (matrix) {
    matrix.style.height = `${contentBodyHeight}px`;
  }
  if (railInner) {
    railInner.style.height = `${contentBodyHeight}px`;
  }
  if (headerInner) {
    headerInner.style.width = `${layout.width - railWidth}px`;
  }

  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));

  const captureSize = measureShellCaptureSize(shell, {
    width: layout.width,
    height: totalHeight,
  });

  try {
    const dataUrl = await captureElementPng(shell, captureSize);
    downloadDataUrl(dataUrl, filename);
  } finally {
    if (!prev.dataExporting) {
      shell.removeAttribute('data-exporting');
    } else {
      shell.setAttribute('data-exporting', '');
    }
    shell.style.width = prev.shellWidth;
    shell.style.height = prev.shellHeight;
    shell.style.minHeight = prev.shellMinHeight;
    shell.style.maxWidth = prev.shellMaxWidth;
    shell.style.maxHeight = prev.shellMaxHeight;
    shell.style.overflow = prev.shellOverflow;
    shell.style.flex = prev.shellFlex;
    shell.style.gridTemplateRows = prev.shellGridRows;
    if (overviewRoot) {
      overviewRoot.style.overflow = prev.rootOverflow ?? '';
      overviewRoot.style.height = prev.rootHeight ?? '';
      overviewRoot.style.minHeight = prev.rootMinHeight ?? '';
    }
    if (header) {
      header.style.overflow = prev.headerOverflow ?? '';
    }
    if (rail) {
      rail.style.overflow = prev.railOverflow ?? '';
    }
    if (headerInner) {
      headerInner.style.transform = prev.headerInnerTransform ?? '';
    }
    if (railInner) {
      railInner.style.transform = prev.railInnerTransform ?? '';
    }
    if (body) {
      body.style.overflow = prev.bodyOverflow ?? '';
      body.style.width = prev.bodyWidth ?? '';
      body.style.height = prev.bodyHeight ?? '';
      body.style.minHeight = prev.bodyMinHeight ?? '';
      body.style.maxHeight = prev.bodyMaxHeight ?? '';
      body.scrollLeft = prev.scrollLeft;
      body.scrollTop = prev.scrollTop;
    }
    if (matrix) {
      matrix.style.width = prev.matrixWidth ?? '';
      matrix.style.height = prev.matrixHeight ?? '';
    }
    if (railInner) {
      railInner.style.height = prev.railInnerHeight ?? '';
    }
  }
}
