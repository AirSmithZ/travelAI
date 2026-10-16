import { useMemo } from 'react';
import { usePlanStore, selectActiveItinerary } from '../../stores/usePlanStore';
import {
  buildTripDigest,
  formatZhDate,
  type DigestHighlight,
  type DigestStay,
  type HighlightMark,
} from '../../utils/tripDigest';
import './TripDigestPanel.css';

interface TripDigestPanelProps {
  open: boolean;
  onClose: () => void;
}

function markText(mark: HighlightMark, group: string): string {
  if (mark.status === 'in') return '已写入';
  if (mark.status === 'other') return `写在 ${formatZhDate(mark.date)} ${mark.region}`;
  if (group === '已注释') return '已注释';
  return '未写入';
}

function StayBlock({
  stay,
  onFocusDay,
}: {
  stay: DigestStay;
  onFocusDay: (index: number) => void;
}) {
  const owned = stay.highlights.filter((item) => item.group === '已有');
  const written = owned.filter((item) => item.mark.status === 'in').length;
  const groups: { group: string; items: DigestHighlight[] }[] = [];
  for (const item of stay.highlights) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  const first = stay.days[0];
  const lastDay = stay.days[stay.days.length - 1];
  const when =
    stay.days.length === 1
      ? `${formatZhDate(first.date)} ${first.weekday}`
      : `${formatZhDate(first.date)} – ${formatZhDate(lastDay.date)}`;

  return (
    <section className="digest-stay">
      <header className="digest-stay__head">
        <div>
          <h3 className="digest-stay__title">
            {stay.region}
            {stay.country ? <span> · {stay.country}</span> : null}
          </h3>
          <p className="digest-stay__when">
            {when} · {stay.days.length} 天
            {owned.length > 0 ? ` · 已有 ${owned.length}，写入 ${written}` : ''}
          </p>
        </div>
      </header>
      {stay.note ? <p className="digest-stay__note">{stay.note}</p> : null}
      <ul className="digest-days">
        {stay.days.map((day) => (
          <li key={day.date}>
            <button type="button" className="digest-day" onClick={() => onFocusDay(day.index)}>
              <span className="digest-day__date">
                {formatZhDate(day.date)} {day.weekday}
              </span>
              <span className="digest-day__label">{day.label}</span>
            </button>
          </li>
        ))}
      </ul>
      {groups.length === 0 ? (
        <p className="digest-empty">这一段没有挂上亮点库。</p>
      ) : (
        groups.map((group) => (
          <details key={group.group} className="digest-group" open={group.group === '已有'}>
            <summary>
              {group.group}
              <span>{group.items.length}</span>
            </summary>
            <ul className="digest-items">
              {group.items.map((item) => (
                <li key={`${item.group}-${item.name}`} className={`digest-item digest-item--${item.mark.status}`}>
                  <div className="digest-item__row">
                    <strong>{item.name}</strong>
                    <span className={`digest-mark digest-mark--${item.mark.status}`}>
                      {markText(item.mark, item.group)}
                    </span>
                  </div>
                  {item.why ? <p>{item.why}</p> : null}
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </section>
  );
}

/** 旅行天数、每段去哪、对应亮点是否已经写进站点。 */
export function TripDigestPanel({ open, onClose }: TripDigestPanelProps) {
  const itinerary = usePlanStore(selectActiveItinerary);
  const setActiveView = usePlanStore((s) => s.setActiveView);
  const setGraphViewMode = usePlanStore((s) => s.setGraphViewMode);
  const scrollOverviewToDay = usePlanStore((s) => s.scrollOverviewToDay);
  const digest = useMemo(() => buildTripDigest(itinerary?.days ?? []), [itinerary]);

  if (!open) return null;

  function focusDay(index: number) {
    setActiveView('graph');
    setGraphViewMode('overview');
    scrollOverviewToDay(index);
    onClose();
  }

  return (
    <div className="digest-panel" role="dialog" aria-label="行程汇总" data-testid="digest-panel">
      <div className="digest-panel__backdrop" onClick={onClose} aria-hidden />
      <aside className="digest-panel__drawer">
        <header className="digest-panel__head">
          <div>
            <h2 className="digest-panel__title">行程汇总</h2>
            <p className="digest-panel__sub">
              按当天住下的区域归段，换城那天算进到达的城。亮点来自讨论参考。已写入表示这一段里有停留站点对得上名字；顺路不停车和加油站不算。
            </p>
          </div>
          <button type="button" className="digest-panel__close" onClick={onClose}>
            关闭
          </button>
        </header>

        {digest.dayCount === 0 ? (
          <p className="digest-empty">还没有行程。生成或录入之后，这里按天和区域列出亮点。</p>
        ) : (
          <div className="digest-panel__scroll">
            <ul className="digest-stats">
              <li>
                <span>旅行天数</span>
                <strong>{digest.dayCount} 天</strong>
              </li>
              <li>
                <span>日期</span>
                <strong>
                  {formatZhDate(digest.dateStart)} – {formatZhDate(digest.dateEnd)}
                </strong>
              </li>
              <li>
                <span>分段</span>
                <strong>{digest.stays.length} 段</strong>
              </li>
            </ul>

            {digest.stays.map((stay) => (
              <StayBlock key={`${stay.region}-${stay.days[0]?.date ?? ''}`} stay={stay} onFocusDay={focusDay} />
            ))}

            {digest.asideCities.length > 0 && (
              <section className="digest-stay">
                <h3 className="digest-stay__title">亮点库里有，这趟没去</h3>
                <ul className="digest-items">
                  {digest.asideCities.map((city) => (
                    <li key={city.city} className="digest-item">
                      <div className="digest-item__row">
                        <strong>
                          {city.city}
                          {city.country ? ` · ${city.country}` : ''}
                        </strong>
                      </div>
                      <p>{city.note}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
