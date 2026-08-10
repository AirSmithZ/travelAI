import { afterEach, describe, expect, it } from 'vitest';
import {
  clearEvidenceLinkCache,
  evidenceLinkCacheKey,
  getCachedEvidenceFromLink,
  setCachedEvidenceFromLink,
} from './evidenceLinkCache';

describe('evidenceLinkCache', () => {
  afterEach(() => {
    clearEvidenceLinkCache();
  });

  it('normalizes short-link variants to the same key host/path', () => {
    const a = evidenceLinkCacheKey('http://xhslink.cn/o/8JSFii2PXbu');
    const b = evidenceLinkCacheKey('https://xhslink.cn/o/8JSFii2PXbu/');
    expect(a).toBe(b);
    expect(a).toBe('xhslink.cn/o/8JSFii2PXbu');
  });

  it('returns cached item for the same link', () => {
    setCachedEvidenceFromLink(
      'http://xhslink.cn/o/8JSFii2PXbu',
      {
        title: '秒懂新西兰自由行',
        url: 'http://xhslink.cn/o/8JSFii2PXbu',
        snippet: '90+自由行玩法',
        source: 'user_paste_tavily',
        note_id: '690c73490000000003038445',
      },
      'xhs_tavily',
    );
    const hit = getCachedEvidenceFromLink('https://xhslink.cn/o/8JSFii2PXbu');
    expect(hit?.ok).toBe(true);
    expect(hit?.fromCache).toBe(true);
    expect(hit?.item.title).toContain('新西兰');
  });
});
