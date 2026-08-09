import { describe, expect, it } from 'vitest';
import {
  createParseActivity,
  formatActivitySummary,
  summarizeParseHintFromMessage,
} from './chatActivity';

describe('summarizeParseHintFromMessage', () => {
  it('extracts destination, days, dates, people, budget', () => {
    const hint = summarizeParseHintFromMessage(
      '从上海到新加坡，2人，创作4天3晚自由行，时间从8.30开始，预算人均1.5万',
    );
    expect(hint).toContain('新加坡');
    expect(hint).toContain('4天');
    expect(hint).toContain('2人');
    expect(hint).toContain('人均1.5万');
    expect(hint).toMatch(/8\.?30|8\/30/);
  });

  it('returns undefined for empty or unparseable text', () => {
    expect(summarizeParseHintFromMessage('')).toBeUndefined();
    expect(summarizeParseHintFromMessage('你好')).toBeUndefined();
  });
});

describe('createParseActivity', () => {
  it('omits ack and uses user-facing steps', () => {
    const session = createParseActivity('新加坡 · 4天 · 2人');
    expect(session.title).toBe('正在识别行程信息');
    expect(session.steps.map((s) => s.id)).toEqual(['parse_llm', 'parse_validate']);
    expect(session.steps[0]).toMatchObject({
      label: '识别行程信息',
      status: 'running',
      detail: '新加坡 · 4天 · 2人',
    });
    expect(session.steps[1].label).toBe('整理待确认项');
  });
});

describe('formatActivitySummary', () => {
  it('strips 正在 from title for completion copy', () => {
    const session = createParseActivity('新加坡');
    session.steps = session.steps.map((s) => ({ ...s, status: 'done' as const }));
    const text = formatActivitySummary(session, 3200);
    expect(text.startsWith('识别行程信息完成')).toBe(true);
    expect(text).not.toContain('正在识别');
  });
});
