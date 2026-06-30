import type maplibregl from 'maplibre-gl';

/** OpenFreeMap dark 样式使用的字体栈 */
export const MAP_LABEL_FONT = ['Noto Sans Regular'] as const;

/** 占位纹理，避免 wood-pattern 等 sprite 缺失报错 */
function addPlaceholderImage(map: maplibregl.Map, id: string) {
  if (map.hasImage(id)) return;

  const isPattern = /pattern|wood|grass|sand|wetland/i.test(id);
  const size = isPattern ? 8 : 1;
  const data = new Uint8Array(size * size * 4);

  if (isPattern) {
    for (let i = 0; i < size * size; i += 1) {
      data[i * 4] = 72;
      data[i * 4 + 1] = 56;
      data[i * 4 + 2] = 42;
      data[i * 4 + 3] = 160;
    }
  }

  map.addImage(id, { width: size, height: size, data }, { pixelRatio: 1 });
}

/** 监听 styleimagemissing，静默补齐 OpenFreeMap 样式中缺失的 pattern sprite */
export function bindMapStylePatches(map: maplibregl.Map): () => void {
  const onMissingImage = (e: { id: string }) => {
    try {
      addPlaceholderImage(map, e.id);
    } catch {
      /* 并发加载时可能已添加 */
    }
  };

  map.on('styleimagemissing', onMissingImage);
  return () => {
    map.off('styleimagemissing', onMissingImage);
  };
}

/** 样式加载完成后再执行；若尚未就绪则等待 load 事件 */
export function whenMapStyleReady(map: maplibregl.Map, fn: () => void): () => void {
  const run = () => {
    if (map.isStyleLoaded()) fn();
  };

  if (map.isStyleLoaded()) {
    run();
  } else {
    map.once('load', run);
  }

  return () => {
    map.off('load', run);
  };
}
