import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { actions, useTrip } from './store';
import { DayStrip } from './components/DayStrip';
import { ExpenseBoard } from './components/ExpenseBoard';
import { FlowBoard } from './components/FlowBoard';
import { NodePanel } from './components/NodePanel';
import type { LayoutLock, PanelId, Scope, TripEdge } from './types';

const TripMap = lazy(() => import('./components/TripMap').then((mod) => ({ default: mod.TripMap })));

const NO_EDGES: TripEdge[] = [];

interface DeviceBox {
  w: number;
  h: number;
  offsetTop: number;
  landscape: boolean;
}

function readBox(): DeviceBox {
  const viewport = window.visualViewport;
  return {
    w: Math.round(viewport?.width ?? window.innerWidth),
    h: Math.round(window.innerHeight),
    offsetTop: 0,
    landscape: window.matchMedia('(orientation: landscape)').matches,
  };
}

function useDeviceBox(): DeviceBox {
  const [box, setBox] = useState(readBox);
  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape)');
    const apply = () => setBox(readBox());
    apply();
    media.addEventListener('change', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', apply);
    viewport?.addEventListener('scroll', apply);
    return () => {
      media.removeEventListener('change', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      viewport?.removeEventListener('resize', apply);
      viewport?.removeEventListener('scroll', apply);
    };
  }, []);
  return box;
}

function PhoneDialog({
  open,
  label,
  onClose,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="phone-layer" role="presentation" onClick={onClose}>
      <div
        className="phone-layer__panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const LAYOUTS: { id: LayoutLock; label: string; note: string }[] = [
  { id: 'auto', label: '跟随旋转', note: '横握用左侧详情，可收起。竖握点站点打开弹框。' },
  { id: 'portrait', label: '竖版', note: '点流程或地图上的站点，弹框看详情，可以关掉。' },
  { id: 'landscape', label: '横版', note: '详情固定在左侧，可以收起或展开。' },
];

export function PhoneApp() {
  const { doc, ui, storageOk } = useTrip();
  const box = useDeviceBox();
  const [menu, setMenu] = useState<null | 'layout' | 'more'>(null);
  const [menuPlace, setMenuPlace] = useState<CSSProperties | undefined>();
  const [askReset, setAskReset] = useState(false);
  const [desk, setDesk] = useState(false);
  const [railOpen, setRailOpen] = useState(true);

  const wantLand = ui.layoutLock === 'landscape' || (ui.layoutLock === 'auto' && box.landscape);
  const landBlocked = wantLand && box.w < 680;
  const land = wantLand && !landBlocked;
  const short = box.h < 460;
  const day = doc.itinerary.days[ui.dayIndex];
  const first = doc.itinerary.days[0];
  const last = doc.itinerary.days[doc.itinerary.days.length - 1];
  const crossEdges = doc.itinerary.cross_day_edges ?? NO_EDGES;
  const showRail = land && (ui.panel !== 'cost' || Boolean(ui.editor));
  const modalOpen = !land && (desk || Boolean(ui.selectedId) || Boolean(ui.editor));

  const mapDays = useMemo(() => {
    if (ui.scope === 'all') return doc.itinerary.days;
    const one = doc.itinerary.days[ui.dayIndex];
    return one ? [one] : [];
  }, [doc, ui.scope, ui.dayIndex]);

  useEffect(() => {
    if (land && ui.editor) setRailOpen(true);
  }, [land, ui.editor]);

  function choosePanel(panel: PanelId) {
    setMenu(null);
    actions.setPanel(panel);
  }

  function chooseScope(scope: Scope) {
    setMenu(null);
    actions.setScope(scope);
  }

  function toggleMenu(next: 'layout' | 'more', button: HTMLButtonElement) {
    if (menu === next) {
      setMenu(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth * 0.78);
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const openUp = below < 160 && above > below;
    const top = openUp ? 8 : rect.bottom + 6;
    const maxHeight = openUp ? Math.max(120, rect.top - 14) : Math.max(120, below - 6);
    setMenuPlace({ top, left, maxHeight });
    setMenu(next);
  }

  function hideModal() {
    setDesk(false);
    actions.closeDetail();
  }

  const nodePanel = (
    <NodePanel
      doc={doc}
      editor={ui.editor}
      selectedId={ui.selectedId}
      dayIndex={ui.dayIndex}
      variant={land ? 'side' : 'modal'}
      onClose={hideModal}
    />
  );

  return (
    <div
      className={`shell${land ? ' is-land' : ' is-port'}${short ? ' is-short' : ''}`}
    >
      <header className="header">
        <div className="brand">
          <p className="eyebrow">ANZ</p>
          <h1>澳新行程</h1>
          <small>
            {first ? `${first.date.slice(5)} – ${last.date.slice(5)}` : '没有日期'}
            {doc.origin === 'local' ? ' · 本机已改' : ' · 初始数据'}
          </small>
        </div>
        <div className="seg" role="tablist" aria-label="视图">
          {(
            [
              ['graph', '流程'],
              ['map', '地图'],
              ['cost', '开销'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ui.panel === id}
              className={ui.panel === id ? 'is-on' : ''}
              data-testid={`panel-${id}`}
              onClick={() => choosePanel(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="scope" role="tablist" aria-label="范围">
          <button
            type="button"
            role="tab"
            aria-selected={ui.scope === 'day'}
            className={ui.scope === 'day' ? 'is-on' : ''}
            data-testid="scope-day"
            onClick={() => chooseScope('day')}
          >
            当天
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={ui.scope === 'all'}
            className={ui.scope === 'all' ? 'is-on' : ''}
            data-testid="scope-all"
            onClick={() => chooseScope('all')}
          >
            总行程
          </button>
        </div>
        {!land ? (
          <button
            type="button"
            className={`icon-btn${modalOpen ? ' is-on' : ''}`}
            aria-expanded={modalOpen}
            data-testid="open-node-panel"
            onClick={() => {
              setMenu(null);
              if (modalOpen) hideModal();
              else setDesk(true);
            }}
          >
            {modalOpen ? '隐藏' : '节点'}
          </button>
        ) : null}
        <div className="menu-wrap">
          <button
            type="button"
            className="icon-btn"
            aria-expanded={menu === 'layout'}
            data-testid="layout"
            onClick={(event) => toggleMenu('layout', event.currentTarget)}
          >
            布局
          </button>
          {menu === 'layout' && (
            <div className="menu" role="menu" style={land ? menuPlace : undefined}>
              {LAYOUTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={ui.layoutLock === item.id}
                  className={ui.layoutLock === item.id ? 'is-on' : ''}
                  onClick={() => {
                    actions.setLayoutLock(item.id);
                    setMenu(null);
                  }}
                >
                  <b>{item.label}</b>
                  <small>{item.note}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="menu-wrap">
          <button
            type="button"
            className="icon-btn"
            aria-expanded={menu === 'more'}
            onClick={(event) => toggleMenu('more', event.currentTarget)}
          >
            更多
          </button>
          {menu === 'more' && (
            <div className="menu" role="menu" style={land ? menuPlace : undefined}>
              <p className="menu-note">
                {doc.origin === 'seed'
                  ? '还没改过。这台手机没有存档时，用 anzTrip.json。'
                  : `存在这台手机里。上次写入 ${doc.savedAt ? doc.savedAt.slice(0, 16).replace('T', ' ') : '刚刚'}。`}
              </p>
              <button
                type="button"
                className="danger-item"
                onClick={() => {
                  setMenu(null);
                  setAskReset(true);
                }}
              >
                恢复初始行程
              </button>
            </div>
          )}
        </div>
      </header>

      {landBlocked ? <p className="hint-line">屏幕太窄，横版左栏放不下，先用竖版弹框。</p> : null}
      {!storageOk ? <p className="hint-line">这台浏览器没能写入本地存储，刷新后修改会丢。</p> : null}

      <div className="workspace">
        {showRail ? (
          <aside className={`rail${railOpen ? '' : ' is-shut'}`} aria-label="站点详情">
            <button
              type="button"
              className="rail-toggle"
              aria-expanded={railOpen}
              data-testid="rail-toggle"
              onClick={() => setRailOpen((open) => !open)}
            >
              {railOpen ? '收起' : '详情'}
            </button>
            <div className="rail-scroll" hidden={!railOpen}>
              {nodePanel}
            </div>
          </aside>
        ) : null}

        <main className="stage">
          {ui.panel !== 'cost' ? (
            <div className="strip-row">
              {ui.scope === 'day' ? (
                <DayStrip
                  days={doc.itinerary.days}
                  dayIndex={ui.dayIndex}
                  locked={Boolean(ui.editor)}
                  onPick={(index) => actions.setDay(index)}
                />
              ) : (
                <p className="strip-note">
                  总行程 {doc.itinerary.days.length} 天。点列头只是换到那天看，日期本身不能改。
                  {day ? ` 当前 D${day.day_index} ${day.region ?? ''}。` : ''}
                </p>
              )}
            </div>
          ) : null}

          <div className="stage-view">
            <div className={`view view--front${ui.panel === 'graph' ? '' : ' is-off'}`} data-testid="view-graph">
              <FlowBoard
                days={doc.itinerary.days}
                scope={ui.scope}
                dayIndex={ui.dayIndex}
                crossEdges={crossEdges}
                selectedId={ui.selectedId}
                onSelect={(id) => {
                  actions.selectNode(id);
                  if (!land) setDesk(true);
                }}
                onPickDay={(index) => actions.pickOverviewDay(index)}
              />
            </div>
            <div className={`view view--map${ui.panel === 'map' ? '' : ' is-off'}`} aria-hidden={ui.panel !== 'map'}>
              <Suspense fallback={<p className="empty-note">地图加载中…</p>}>
                <TripMap
                  active={ui.panel === 'map'}
                  days={mapDays}
                  crossEdges={crossEdges}
                  includeCross={ui.scope === 'all'}
                  selectedId={ui.selectedId}
                  onSelect={(id) => {
                    actions.selectNode(id);
                    if (!land) setDesk(true);
                  }}
                />
              </Suspense>
            </div>
            <div className={`view view--front${ui.panel === 'cost' ? '' : ' is-off'}`}>
              <ExpenseBoard doc={doc} scope={ui.scope} dayIndex={ui.dayIndex} />
            </div>
          </div>
        </main>
      </div>

      {menu ? <button type="button" className="menu-dismiss" aria-label="关闭菜单" onClick={() => setMenu(null)} /> : null}

      <PhoneDialog open={modalOpen} label="节点详情" onClose={hideModal}>
        <div className="detail-modal">
          {nodePanel}
        </div>
      </PhoneDialog>

      <PhoneDialog open={askReset} label="恢复初始行程" onClose={() => setAskReset(false)}>
        <div className="modal">
          <h2>恢复初始行程</h2>
          <p>这台手机上改过的站点会丢掉，换回 anzTrip.json 里的那一版。天数仍是原来的那些天。</p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-danger"
              data-testid="reset-seed"
              onClick={() => {
                actions.resetSeed();
                setAskReset(false);
                setDesk(false);
              }}
            >
              恢复
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setAskReset(false)}>
              留下
            </button>
          </div>
        </div>
      </PhoneDialog>
    </div>
  );
}
