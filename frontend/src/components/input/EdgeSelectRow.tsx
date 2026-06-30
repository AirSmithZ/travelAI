import { CATEGORY_META } from '../../data/categoryTokens';
import type { ItineraryNode } from '../../types/itinerary';
import { FormSelect } from '../ui/FormField';
import './EdgeSelectRow.css';

interface EdgeConnectFieldProps {
  direction: 'out' | 'in';
  /** 已连接的目标/来源节点 id，无则空态 */
  connectedNodeId?: string;
  /** 已连接边 id，用于删除 */
  edgeId?: string;
  peerNodes: ItineraryNode[];
  candidates: ItineraryNode[];
  emptyHint: string;
  placeholder: string;
  onAdd: (nodeId: string) => void;
  onRemove: (edgeId: string) => void;
}

/** 出边/入边：有值时禁用选择 + 删除；无值时仅下拉选择 */
export function EdgeConnectField({
  direction,
  connectedNodeId,
  edgeId,
  peerNodes,
  candidates,
  emptyHint,
  placeholder,
  onAdd,
  onRemove,
}: EdgeConnectFieldProps) {
  const locked = Boolean(connectedNodeId && edgeId);
  const selectOptions = locked ? peerNodes : candidates;

  if (!locked && candidates.length === 0) {
    return <p className="edge-connect-group__empty">{emptyHint}</p>;
  }

  return (
    <div
      className={`edge-connect ${locked ? 'edge-connect--locked' : 'edge-connect--pick'}`}
      data-direction={direction}
    >
      <span className="edge-connect__dir" aria-hidden="true">
        {direction === 'out' ? '→' : '←'}
      </span>

      <div className="edge-connect__select">
        <FormSelect
          className="edge-connect__native"
          disabled={locked}
          value={connectedNodeId ?? ''}
          onChange={(e) => {
            if (!locked && e.target.value) onAdd(e.target.value);
          }}
        >
          {!locked && <option value="">{placeholder}</option>}
          {selectOptions.map((n) => {
            const m = CATEGORY_META[n.category];
            return (
              <option key={n.id} value={n.id}>
                {m.icon} {n.name}
              </option>
            );
          })}
        </FormSelect>
      </div>

      {locked && edgeId && (
        <button
          type="button"
          className="edge-connect__remove"
          aria-label="删除连线"
          title="删除连线"
          onClick={() => onRemove(edgeId)}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M3.5 3.5l7 7M10.5 3.5l-7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

interface EdgeConnectGroupProps {
  label: string;
  direction: 'out' | 'in';
  emptyHint: string;
  peerNodes: ItineraryNode[];
  candidates: ItineraryNode[];
  connected?: { edgeId: string; nodeId: string };
  placeholder: string;
  onAdd: (nodeId: string) => void;
  onRemove: (edgeId: string) => void;
}

export function EdgeConnectGroup({
  label,
  direction,
  emptyHint,
  peerNodes,
  candidates,
  connected,
  placeholder,
  onAdd,
  onRemove,
}: EdgeConnectGroupProps) {
  return (
    <div className="edge-connect-group">
      <div className="edge-connect-group__label">{label}</div>
      <EdgeConnectField
        direction={direction}
        connectedNodeId={connected?.nodeId}
        edgeId={connected?.edgeId}
        peerNodes={peerNodes}
        candidates={candidates}
        emptyHint={emptyHint}
        placeholder={placeholder}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    </div>
  );
}
