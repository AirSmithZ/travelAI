import { useRef, useState } from 'react';
import { verifyFlightFromText } from '../api/flights';
import type { FlightIntentMessage, FlightQuote, FlightVerifyTurn } from '../types/flight';
import { formatDuration, formatLegRoute, formatPreference, formatPrice } from '../types/flight';
import './FlightVerifyApp.css';

const EXAMPLES = [
  '10月16日上海飞新加坡，2人，便宜优先',
  '8月1号成都到曼谷，要直飞',
  '帮我查北京去东京的单程，最快到达',
];

const PREFERENCE_LABEL: Record<string, string> = {
  cheap: '便宜优先',
  fast: '省时优先',
  balanced: '综合平衡',
};

function formatParsed(parsed: FlightVerifyTurn['response']['parsed']): string {
  const rows = [
    ['出发地', parsed.origin ?? '—'],
    ['目的地', parsed.destination ?? '—'],
    ['出发日期', parsed.date ?? '—'],
    ['返程日期', parsed.return_date ?? '—'],
    ['人数', String(parsed.adults)],
    ['偏好', PREFERENCE_LABEL[parsed.preference] ?? parsed.preference],
  ];
  return rows.map(([k, v]) => `${k}：${v}`).join(' · ');
}

function OfferRow({ offer }: { offer: FlightQuote }) {
  return (
    <tr>
      <td>{offer.rank ?? '—'}</td>
      <td>{offer.airline}</td>
      <td className="flight-verify__route">{formatLegRoute(offer)}</td>
      <td>{offer.depart_time} → {offer.arrive_time}</td>
      <td>{formatDuration(offer.duration_minutes)}</td>
      <td>{offer.stops === 0 ? '直飞' : `${offer.stops} 停`}</td>
      <td>{formatPrice(offer)}</td>
      <td>{offer.rank_reason ?? '—'}</td>
    </tr>
  );
}

export function FlightVerifyApp() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<FlightVerifyTurn[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setLoading(true);
    setError(null);
    setInput('');

    const history: FlightIntentMessage[] = turns.flatMap((turn) => [
      { role: 'user' as const, content: turn.userMessage },
      { role: 'assistant' as const, content: turn.response.reply },
    ]);

    try {
      const response = await verifyFlightFromText({ message, chat_history: history });
      setTurns((prev) => [
        ...prev,
        { id: crypto.randomUUID(), userMessage: message, response },
      ]);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
      setInput(message);
    } finally {
      setLoading(false);
    }
  }

  function handleExample(text: string) {
    setInput(text);
  }

  function handleReset() {
    setTurns([]);
    setError(null);
    setInput('');
  }

  return (
    <div className="flight-verify">
      <header className="flight-verify__header">
        <p className="flight-verify__badge">开发工具 · 非正式功能</p>
        <h1>航班 LLM 验证</h1>
        <p className="flight-verify__desc">
          自然语言 → LLM 解析意图 → LetsFG 参考价 + 排序 → LLM 推荐分析。
          Trip.com 链接仅作实时查价/预订入口。与主 App 无关。
        </p>
      </header>

      <div className="flight-verify__examples">
        <span className="flight-verify__examples-label">示例：</span>
        {EXAMPLES.map((text) => (
          <button
            key={text}
            type="button"
            className="flight-verify__example"
            onClick={() => handleExample(text)}
            disabled={loading}
          >
            {text}
          </button>
        ))}
      </div>

      <div className="flight-verify__chat" ref={listRef}>
        {turns.length === 0 && !loading && (
          <p className="flight-verify__empty">
            在下方输入需求，例如「10月16日上海飞新加坡，便宜优先」
          </p>
        )}

        {turns.map((turn) => {
          const ranked = turn.response.search?.ranked ?? [];
          return (
            <article key={turn.id} className="flight-verify__turn">
              <div className="flight-verify__bubble flight-verify__bubble--user">
                {turn.userMessage}
              </div>

              <div className="flight-verify__bubble flight-verify__bubble--assistant">
                <p className="flight-verify__reply">{turn.response.reply}</p>

                <div className="flight-verify__parsed">
                  <p className="flight-verify__parsed-title">LLM 解析</p>
                  <p>{formatParsed(turn.response.parsed)}</p>
                  {turn.response.parsed.missing_fields.length > 0 && (
                    <p className="flight-verify__missing">
                      缺失：{turn.response.parsed.missing_fields.join('、')}
                    </p>
                  )}
                </div>

                {turn.response.recommendation && (
                  <div className="flight-verify__recommend">
                    <p className="flight-verify__recommend-title">LLM 推荐分析</p>
                    <p>{turn.response.recommendation}</p>
                  </div>
                )}

                {ranked.length > 0 && (
                  <div className="flight-verify__offers">
                    <p className="flight-verify__offers-title">
                      LetsFG 参考价 Top {ranked.length}
                      <span className="flight-verify__offers-sub">
                        （{formatPreference(turn.response.parsed.preference)}）
                      </span>
                    </p>
                    <div className="flight-verify__table-wrap">
                      <table className="flight-verify__table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>航司</th>
                            <th>航线</th>
                            <th>时刻</th>
                            <th>时长</th>
                            <th>经停</th>
                            <th>参考价</th>
                            <th>理由</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ranked.map((offer) => (
                            <OfferRow key={offer.id} offer={offer} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {turn.response.warnings && turn.response.warnings.length > 0 && (
                  <div className="flight-verify__warn">
                    {turn.response.warnings.join('；')}
                  </div>
                )}

                {turn.response.search?.purchase?.url && (
                  <div className="flight-verify__link-box flight-verify__link-box--secondary">
                    <p className="flight-verify__link-label">Trip.com 实时查价 / 预订</p>
                    <a
                      href={turn.response.search.purchase.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      打开 Trip.com 查看实时价格与余位 →
                    </a>
                  </div>
                )}

                {turn.response.search && (
                  <details className="flight-verify__details">
                    <summary>完整 API JSON</summary>
                    <pre className="flight-verify__json">
                      {JSON.stringify(turn.response.search, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </article>
          );
        })}

        {loading && (
          <div className="flight-verify__bubble flight-verify__bubble--assistant flight-verify__bubble--loading">
            LLM 解析中… LetsFG 查价可能需要 1～3 分钟，请稍候
          </div>
        )}
      </div>

      {error && <div className="flight-verify__error">{error}</div>}

      <form className="flight-verify__composer" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="描述航班需求，可含偏好：便宜 / 最快 / 直飞…"
          rows={3}
          disabled={loading}
        />
        <div className="flight-verify__composer-actions">
          <button type="button" className="flight-verify__reset" onClick={handleReset} disabled={loading}>
            清空对话
          </button>
          <button type="submit" disabled={loading || !input.trim()}>
            {loading ? '分析中…' : '发送'}
          </button>
        </div>
      </form>

      <footer className="flight-verify__footer">
        <a href="/">← 返回主 App</a>
      </footer>
    </div>
  );
}
