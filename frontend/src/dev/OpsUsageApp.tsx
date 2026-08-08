import { useCallback, useEffect, useState } from 'react';
import './OpsUsageApp.css';

interface ProviderRow {
  provider: string;
  calls: number;
  ok: number;
  fail: number;
  error_rate: number;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
}

interface UsageEvent {
  ts: number;
  provider: string;
  op: string;
  ok: boolean;
  latency_ms: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  error?: string;
}

interface AccountRow {
  provider: string;
  ok: boolean;
  source?: string;
  summary?: string;
  error?: string;
  hint?: string;
  [key: string]: unknown;
}

interface AccountsBlock {
  fetched_at: number;
  cache_ttl_sec: number;
  note: string;
  accounts: AccountRow[];
}

interface UsageSnapshot {
  started_at: number;
  uptime_sec: number;
  note: string;
  providers: ProviderRow[];
  estimated_cost_usd_total: number;
  recent: UsageEvent[];
  accounts?: AccountsBlock;
}

const apiBase = () => import.meta.env.VITE_API_BASE ?? '';

function fmtMs(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n} ms`;
}

function fmtPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function fmtTime(ts: number): string {
  try {
    return new Date(ts * 1000).toLocaleTimeString();
  } catch {
    return '—';
  }
}

export function OpsUsageApp() {
  const [data, setData] = useState<UsageSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refreshAccounts = false) => {
    try {
      const q = refreshAccounts ? '?refresh_accounts=true' : '';
      const res = await fetch(`${apiBase()}/api/v1/ops/usage${q}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UsageSnapshot;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const reset = async () => {
    if (!window.confirm('清空进程内会话计数？（不影响各厂官方余额）')) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase()}/api/v1/ops/usage/reset`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const accounts = data?.accounts?.accounts ?? [];

  return (
    <div className="ops-usage">
      <header className="ops-usage__header">
        <p className="ops-usage__badge">开发工具 · 非正式功能</p>
        <h1 className="ops-usage__title">API 用量看板</h1>
        <p className="ops-usage__desc">
          优先展示各厂<strong>官方余额/额度</strong>（DeepSeek / SerpAPI / Tavily / TikHub / 和风）。下方会话表仅统计本进程调用次数与延迟，不是账单。
        </p>
        <div className="ops-usage__actions">
          <button type="button" className="ops-usage__btn" onClick={() => void load()} disabled={busy}>
            刷新
          </button>
          <button
            type="button"
            className="ops-usage__btn"
            onClick={() => void load(true)}
            disabled={busy}
          >
            强制刷新官方账户
          </button>
          <button
            type="button"
            className="ops-usage__btn ops-usage__btn--danger"
            onClick={() => void reset()}
            disabled={busy}
          >
            重置会话计数
          </button>
        </div>
      </header>

      {error && <p className="ops-usage__error">加载失败：{error}（确认后端 :8000 已启动）</p>}

      {data && (
        <>
          <p className="ops-usage__meta">
            会话运行 {Math.floor(data.uptime_sec / 60)} 分 · {data.note}
          </p>

          <section className="ops-usage__section">
            <h2>官方账户 / 额度</h2>
            {data.accounts?.note && <p className="ops-usage__hint">{data.accounts.note}</p>}
            {accounts.length === 0 ? (
              <p className="ops-usage__empty">未拉到账户数据</p>
            ) : (
              <ul className="ops-usage__accounts">
                {accounts.map((a) => (
                  <li
                    key={a.provider}
                    className={a.ok ? 'ops-usage__acct' : 'ops-usage__acct ops-usage__acct--fail'}
                  >
                    <div className="ops-usage__acct-head">
                      <strong>{a.provider}</strong>
                      <span>{a.ok ? 'ok' : 'fail'}</span>
                    </div>
                    <p className="ops-usage__acct-sum">{a.ok ? a.summary : a.error}</p>
                    {a.hint && <p className="ops-usage__hint">{a.hint}</p>}
                    {a.source && <p className="ops-usage__acct-src">{a.source}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ops-usage__section">
            <h2>本进程会话（调用次数 / 延迟）</h2>
            {data.providers.length === 0 ? (
              <p className="ops-usage__empty">尚无调用。在主应用跑一次 generate / 搜航班后再看。</p>
            ) : (
              <table className="ops-usage__table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Calls</th>
                    <th>OK</th>
                    <th>Fail</th>
                    <th>Err%</th>
                    <th>P50</th>
                    <th>P95</th>
                    <th>Tokens in/out</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p) => (
                    <tr key={p.provider} className={p.fail > 0 ? 'ops-usage__row--warn' : undefined}>
                      <td>{p.provider}</td>
                      <td>{p.calls}</td>
                      <td>{p.ok}</td>
                      <td>{p.fail}</td>
                      <td>{fmtPct(p.error_rate)}</td>
                      <td>{fmtMs(p.latency_p50_ms)}</td>
                      <td>{fmtMs(p.latency_p95_ms)}</td>
                      <td>
                        {p.prompt_tokens || p.completion_tokens
                          ? `${p.prompt_tokens}/${p.completion_tokens}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="ops-usage__section">
            <h2>最近事件</h2>
            {data.recent.length === 0 ? (
              <p className="ops-usage__empty">无</p>
            ) : (
              <ul className="ops-usage__events">
                {data.recent.map((e, i) => (
                  <li key={`${e.ts}-${e.provider}-${i}`} className={e.ok ? undefined : 'ops-usage__evt--fail'}>
                    <span className="ops-usage__evt-time">{fmtTime(e.ts)}</span>
                    <span className="ops-usage__evt-prov">{e.provider}</span>
                    <span>{e.op}</span>
                    <span>{e.ok ? 'ok' : 'fail'}</span>
                    <span>{e.latency_ms}ms</span>
                    {e.error && <span className="ops-usage__evt-err">{e.error}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
