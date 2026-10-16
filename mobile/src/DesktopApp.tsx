import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { actions, useTrip } from './store';
import { DayStrip } from './components/DayStrip';
import { ExpenseBoard } from './components/ExpenseBoard';
import { FlowBoard } from './components/FlowBoard';
import { NodePanel } from './components/NodePanel';
import type { PanelId, Scope, TripEdge } from './types';
import './desktop.css';

const TripMap = lazy(() => import('./components/TripMap').then((mod) => ({ default: mod.TripMap })));

const NO_EDGES: TripEdge[] = [];
const PANEL_KEY = 'anz-mobile-desk-panel-w';
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 320;
const MAX_WIDTH_CAP = 560;

function readPanelWidth(): number {
  try {
    const raw = localStorage.getItem(PANEL_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const width = Number.parseInt(raw, 10);
    if (!Number.isFinite(width)) return DEFAULT_WIDTH;
    return clampPanelWidth(width);
  } catch {
    return DEFAULT_WIDTH;
  }
}

function maxPanelWidth(): number {
  if (typeof window === 'undefined') return MAX_WIDTH_CAP;
  return Math.min(MAX_WIDTH_CAP, Math.floor(window.innerWidth * 0.4));
}

function clampPanelWidth(width: number): number {
  return Math.max(MIN_WIDTH, Math.min(width, maxPanelWidth()));
}

function useDeskPanelWidth() {
  const [width, setWidth] = useState(readPanelWidth);

  useEffect(() => {
    const onResize = () => setWidth((current) => clampPanelWidth(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startResize = useCallback(
    (clientX: number) => {
      const startX = clientX;
      const startW = width;
      const onMove = (event: MouseEvent) => {
        setWidth(clampPanelWidth(startW + (event.clientX - startX)));
      };
      const onUp = (event: MouseEvent) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const finalWidth = clampPanelWidth(startW + (event.clientX - startX));
        setWidth(finalWidth);
        try {
          localStorage.setItem(PANEL_KEY, String(finalWidth));
        } catch {
          /* 宽度记不住也不影响编辑 */
        }
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [width],
  );

  return { width, startResize };
}

function PanelChevron({ direction }: { direction: 'left' | 'right' }) {
  const d = direction === 'left' ? 'M9 3 4.5 7 9 11' : 'M5 3 9.5 7 5 11';
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DesktopApp() {
  const { doc, ui, storageOk } = useTrip();
  const { width, startResize } = useDeskPanelWidth();
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [askReset, setAskReset] = useState(false);
  const held = useRef<'graph' | 'map'>(ui.panel === 'map' ? 'map' : 'graph');
  if (ui.panel === 'graph' || ui.panel === 'map') held.current = ui.panel;
  const stage: 'graph' | 'map' = ui.panel === 'cost' ? held.current : ui.panel;

  const day = doc.itinerary.days[ui.dayIndex];
  const first = doc.itinerary.days[0];
  const last = doc.itinerary.days[doc.itinerary.days.length - 1];
  const crossEdges = doc.itinerary.cross_day_edges ?? NO_EDGES;
  const expenseOpen = ui.panel === 'cost';

  const mapDays = ui.scope === 'all' ? doc.itinerary.days : day ? [day] : [];

  useEffect(() => {
    if (ui.editor) setCollapsed(false);
  }, [ui.editor]);

  function pickNode(id: string) {
    actions.selectNode(id);
    setCollapsed(false);
  }

  function choosePanel(panel: Exclude<PanelId, 'cost'>) {
    setMenu(false);
    actions.setPanel(panel);
  }

  function chooseScope(scope: Scope) {
    setMenu(false);
    actions.setScope(scope);
  }

  function openExpense() {
    setMenu(false);
    actions.setPanel('cost');
  }

  function closeExpense() {
    if (ui.panel === 'cost') actions.setPanel(held.current);
  }

  const nodePanel = (
    <NodePanel
      doc={doc}
      editor={ui.editor}
      selectedId={ui.selectedId}
      dayIndex={ui.dayIndex}
      variant="side"
      host="desk"
    />
  );

  return (
    <div className="desk">
      <header className="desk__header">
        <div className="desk__brand">
          <span className="desk__logo" aria-hidden>
            ✦
          </span>
          <div>
            <h1 className="desk__title">澳新行程</h1>
            <p className="desk__subtitle">
              {first ? `${first.date.slice(5)} – ${last.date.slice(5)}` : '没有日期'}
              {doc.origin === 'local' ? ' · 本机已改' : ' · 初始数据'}
            </p>
          </div>
        </div>
        <div className="desk__header-actions">
          <button
            type="button"
            className={`desk__expense-btn${expenseOpen ? ' is-on' : ''}`}
            aria-pressed={expenseOpen}
            data-testid="open-expense"
            onClick={() => (expenseOpen ? closeExpense() : openExpense())}
          >
            开销
          </button>
          <div className="menu-wrap">
            <button
              type="button"
              className="desk__expense-btn"
              aria-expanded={menu}
              onClick={() => setMenu((open) => !open)}
            >
              更多
            </button>
            {menu ? (
              <div className="menu" role="menu">
                <p className="menu-note">
                  {doc.origin === 'seed'
                    ? '还没改过。这台电脑没有存档时，用 anzTrip.json。'
                    : `存在这台电脑里。上次写入 ${doc.savedAt ? doc.savedAt.slice(0, 16).replace('T', ' ') : '刚刚'}。`}
                </p>
                <button
                  type="button"
                  className="danger-item"
                  onClick={() => {
                    setMenu(false);
                    setAskReset(true);
                  }}
                >
                  恢复初始行程
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {!storageOk ? <p className="hint-line">这台浏览器没能写入本地存储，刷新后修改会丢。</p> : null}

      <div className="desk__body">
        <div
          className={`desk__panel${collapsed ? ' is-collapsed' : ''}`}
          style={collapsed ? undefined : { width }}
          aria-hidden={collapsed}
          inert={collapsed ? true : undefined}
        >
          <div className="desk__panel-scroll">{nodePanel}</div>
        </div>
        <button
          type="button"
          className="desk__fold"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <PanelChevron direction={collapsed ? 'right' : 'left'} />
          <span className="desk__fold-label">{collapsed ? '展开' : '收起'}</span>
        </button>
        <div
          className={`desk__resize${collapsed ? ' is-hidden' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label="调整左栏宽度"
          aria-hidden={collapsed}
          onMouseDown={(event) => {
            if (collapsed) return;
            event.preventDefault();
            startResize(event.clientX);
          }}
        />
        <section className="desk__preview" aria-label="行程预览">
          <div className="desk__toolbar">
            <div className="desk__toolbar-left">
              <div className="desk-tabs" role="tablist" aria-label="范围">
                <button
                  type="button"
                  role="tab"
                  aria-selected={ui.scope === 'day'}
                  className={ui.scope === 'day' ? 'is-on' : ''}
                  data-testid="scope-day"
                  onClick={() => chooseScope('day')}
                >
                  单日
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={ui.scope === 'all'}
                  className={ui.scope === 'all' ? 'is-on' : ''}
                  data-testid="scope-all"
                  onClick={() => chooseScope('all')}
                >
                  总览
                </button>
              </div>
              <div className="desk-tabs" role="tablist" aria-label="视图">
                <button
                  type="button"
                  role="tab"
                  aria-selected={stage === 'graph'}
                  className={stage === 'graph' ? 'is-on' : ''}
                  data-testid="panel-graph"
                  onClick={() => choosePanel('graph')}
                >
                  <span className="desk-tabs__icon" aria-hidden>
                    ◇
                  </span>
                  路线图
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={stage === 'map'}
                  className={stage === 'map' ? 'is-on' : ''}
                  data-testid="panel-map"
                  onClick={() => choosePanel('map')}
                >
                  <span className="desk-tabs__icon" aria-hidden>
                    ◎
                  </span>
                  地图
                </button>
              </div>
            </div>
            {ui.scope === 'day' ? (
              <DayStrip
                days={doc.itinerary.days}
                dayIndex={ui.dayIndex}
                locked={Boolean(ui.editor)}
                onPick={(index) => actions.setDay(index)}
              />
            ) : (
              <p className="desk-note">
                总行程 {doc.itinerary.days.length} 天。点列头只是换到那天看，日期本身不能改。
                {day ? ` 当前 D${day.day_index} ${day.region ?? ''}。` : ''}
              </p>
            )}
          </div>
          <div className="desk__stage stage-view">
            <div className={`view view--front${stage === 'graph' ? '' : ' is-off'}`} data-testid="view-graph">
              <FlowBoard
                days={doc.itinerary.days}
                scope={ui.scope}
                dayIndex={ui.dayIndex}
                crossEdges={crossEdges}
                selectedId={ui.selectedId}
                onSelect={pickNode}
                onPickDay={(index) => actions.pickOverviewDay(index)}
              />
            </div>
            <div className={`view view--map${stage === 'map' ? '' : ' is-off'}`} aria-hidden={stage !== 'map'}>
              <Suspense fallback={<p className="empty-note">地图加载中…</p>}>
                <TripMap
                  active={stage === 'map'}
                  days={mapDays}
                  crossEdges={crossEdges}
                  includeCross={ui.scope === 'all'}
                  selectedId={ui.selectedId}
                  onSelect={pickNode}
                />
              </Suspense>
            </div>
          </div>
        </section>
      </div>

      {menu ? <button type="button" className="menu-dismiss" aria-label="关闭菜单" onClick={() => setMenu(false)} /> : null}

      {expenseOpen
        ? createPortal(
            <div className="desk-expense">
              <button type="button" className="desk-expense__backdrop" aria-label="关闭开销" onClick={closeExpense} />
              <div className="desk-expense__drawer" role="dialog" aria-modal="true" aria-label="开销">
                <div className="desk-expense__bar">
                  <button type="button" className="desk-expense__close" onClick={closeExpense}>
                    关闭
                  </button>
                </div>
                <div className="desk-expense__body">
                  <ExpenseBoard
                    doc={doc}
                    scope={ui.scope}
                    dayIndex={ui.dayIndex}
                    onOpenNode={() => setCollapsed(false)}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {askReset
        ? createPortal(
            <div className="modal-back modal-back--center">
              <div className="modal" role="dialog" aria-label="恢复初始行程">
                <h2>恢复初始行程</h2>
                <p>这台电脑上改过的站点会丢掉，换回 anzTrip.json 里的那一版。天数仍是原来的那些天。</p>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-danger"
                    data-testid="reset-seed"
                    onClick={() => {
                      actions.resetSeed();
                      setAskReset(false);
                    }}
                  >
                    恢复
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAskReset(false)}>
                    留下
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
