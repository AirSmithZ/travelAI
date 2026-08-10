/** Validate / extract a pasteable evidence URL before calling from-link. */

const MAX_URL_LEN = 2000;
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"']+/i;

export function extractEvidenceUrl(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';
  const m = text.match(URL_IN_TEXT_RE);
  if (m) return m[0].replace(/[)。,.，]+$/, '');
  return text;
}

export function validateEvidenceUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const url = extractEvidenceUrl(raw);
  if (!url) {
    return { ok: false, error: '请先粘贴链接' };
  }
  if (url.length > MAX_URL_LEN) {
    return { ok: false, error: '内容过长，请只粘贴链接（不要粘贴控制台报错）' };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: '请粘贴以 http(s):// 开头的链接' };
  }
  // Reject obvious console / stack dumps pasted by mistake
  if (
    /getSnapshot|useSyncExternalStore|Maximum update depth|react-dom_client/i.test(url) ||
    url.includes('\n')
  ) {
    return { ok: false, error: '内容不像链接（疑似控制台报错），请清空后重新粘贴小红书链接' };
  }
  return { ok: true, url };
}
