import { getFontEmbedCSS, toPng } from 'html-to-image';
import {
  COLUMN_HEADER_HEIGHT,
} from './layoutOverview';

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

async function captureElementPng(el: HTMLElement): Promise<string> {
  const fontEmbedCSS = await getFontEmbedCSS(el);
  return toPng(el, {
    pixelRatio: 2,
    backgroundColor: '#070b10',
    cacheBust: true,
    fontEmbedCSS,
  });
}

export async function exportElementToPng(el: HTMLElement, filename: string) {
  const prevExporting = el.hasAttribute('data-exporting');
  el.setAttribute('data-exporting', '');
  try {
    const dataUrl = await captureElementPng(el);
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
      const rect = shell.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return;
    }
  }
}

function measureMatrixContentHeight(matrix: HTMLElement, minHeight: number): number {
  let height = Math.max(minHeight, matrix.scrollHeight, matrix.offsetHeight);

  matrix.querySelectorAll<HTMLElement>('.overview-cell').forEach((cell) => {
    height = Math.max(height, cell.offsetTop + cell.offsetHeight);
  });

  matrix.querySelectorAll<HTMLElement>('.overview-bezier-edge').forEach((edge) => {
    height = Math.max(height, edge.offsetTop + edge.offsetHeight);
  });

  return height;
}

/** 展开总览壳层为完整尺寸后导出，保证表头与网格对齐 */
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

  const layoutBodyHeight = layout.height - COLUMN_HEADER_HEIGHT;
  const railWidth = layout.railWidth;

  const prev = {
    shellWidth: shell.style.width,
    shellHeight: shell.style.height,
    shellMaxHeight: shell.style.maxHeight,
    shellMaxWidth: shell.style.maxWidth,
    shellOverflow: shell.style.overflow,
    shellGridRows: shell.style.gridTemplateRows,
    bodyOverflow: body?.style.overflow,
    bodyWidth: body?.style.width,
    bodyHeight: body?.style.height,
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
  shell.setAttribute('data-export-theme', 'light');
  shell.style.width = `${layout.width}px`;
  shell.style.maxWidth = 'none';
  shell.style.maxHeight = 'none';
  shell.style.overflow = 'visible';

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
  shell.style.gridTemplateRows = `${COLUMN_HEADER_HEIGHT}px ${contentBodyHeight}px auto`;

  if (body) {
    body.style.height = `${contentBodyHeight}px`;
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

  try {
    await exportElementToPng(shell, filename);
  } finally {
    if (!prev.dataExporting) {
      shell.removeAttribute('data-exporting');
    } else {
      shell.setAttribute('data-exporting', '');
    }
    shell.removeAttribute('data-export-theme');
    shell.style.width = prev.shellWidth;
    shell.style.height = prev.shellHeight;
    shell.style.maxWidth = prev.shellMaxWidth;
    shell.style.maxHeight = prev.shellMaxHeight;
    shell.style.overflow = prev.shellOverflow;
    shell.style.gridTemplateRows = prev.shellGridRows;
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
