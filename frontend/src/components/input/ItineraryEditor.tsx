import { useMemo } from 'react';
import { usePlanStore, findNodeContext, findEdgeContext, selectActiveItinerary } from '../../stores/usePlanStore';
import { CATEGORY_META } from '../../data/categoryTokens';
import { collectNodeTagPresets } from '../../data/nodeTagPresets';
import { collectTipPresets } from '../../data/tipPresets';
import { collectSceneGroupPresets } from '../../utils/sceneGroups';
import type { NodeCategory, NodeCost } from '../../types/itinerary';
import { ItineraryFormEditor } from './ItineraryFormEditor';
import { RegionCombobox } from './RegionCombobox';
import { listAllRegions } from '../../utils/regionMutations';
import { listEdgesForNode } from '../../utils/edgeMutations';
import { EdgeEditor } from './EdgeEditor';
import { EdgeConnectGroup } from './EdgeSelectRow';
import { TipsEditor } from './TipsEditor';
import { FormField, FormInput, FormNumberInput, FormRow, FormSection, FormSelect } from '../ui/FormField';
import { FormCheckbox } from '../ui/FormCheckbox';
import { TimePicker } from '../ui/TimePicker';
import { TagPicker } from '../ui/TagPicker';
import { NodeCoordEditor } from './NodeCoordEditor';
import './ItineraryEditor.css';

const CATEGORY_OPTIONS = Object.entries(CATEGORY_META) as [
  NodeCategory,
  (typeof CATEGORY_META)[NodeCategory],
][];

export function ItineraryEditor() {
  const itinerary = usePlanStore(selectActiveItinerary);
  const destination =
    usePlanStore((s) => s.getActivePlan().trip_request.destination) ||
    itinerary?.destination ||
    '';
  const selectedNodeId = usePlanStore((s) => s.selectedNodeId);
  const selectedEdgeId = usePlanStore((s) => s.selectedEdgeId);
  const editorTarget = usePlanStore((s) => s.editorTarget);
  const activeDayIndex = usePlanStore((s) => s.activeDayIndex);
  const updateNode = usePlanStore((s) => s.updateNode);
  const removeNode = usePlanStore((s) => s.removeNode);
  const removeEdge = usePlanStore((s) => s.removeEdge);
  const selectNode = usePlanStore((s) => s.selectNode);
  const connectNodes = usePlanStore((s) => s.connectNodes);

  const tagPresets = useMemo(
    () => collectNodeTagPresets(itinerary),
    [itinerary],
  );

  const tipPresets = useMemo(
    () => collectTipPresets(itinerary),
    [itinerary],
  );

  const sceneGroupPresets = useMemo(() => {
    if (!itinerary || !selectedNodeId) return [];
    const ctx = findNodeContext(itinerary, selectedNodeId);
    if (!ctx) return [];
    return collectSceneGroupPresets(itinerary.days[ctx.dayIndex].nodes);
  }, [itinerary, selectedNodeId]);

  const regionOptions = useMemo(
    () => (itinerary ? listAllRegions(itinerary) : []),
    [itinerary],
  );

  const nodeCtx =
    itinerary && selectedNodeId ? findNodeContext(itinerary, selectedNodeId) : null;

  const edgeCtx =
    itinerary && selectedEdgeId ? findEdgeContext(itinerary, selectedEdgeId) : null;

  if (!itinerary) {
    return (
      <div className="itinerary-editor itinerary-editor--empty">
        <p className="itinerary-editor__hint">
          行程尚未生成。请通过<strong>对话</strong>描述需求，确认解析结果后将<strong>自动生成</strong>路线图。
        </p>
      </div>
    );
  }

  if (selectedEdgeId && !selectedNodeId) {
    return edgeCtx ? (
      <EdgeEditor />
    ) : (
      <div className="itinerary-editor itinerary-editor--empty">
        <p className="itinerary-editor__hint">连线不存在或已被删除，请在路线图中重新选择。</p>
      </div>
    );
  }

  if (!selectedNodeId || !nodeCtx) {
    const dayIndex =
      editorTarget?.kind === 'form' && editorTarget.focus === 'day'
        ? editorTarget.dayIndex
        : activeDayIndex;

    const regionName =
      editorTarget?.kind === 'form' && editorTarget.focus === 'region'
        ? editorTarget.regionName
        : undefined;

    const focus = regionName ? 'region' : 'day';

    return (
      <div className="itinerary-editor">
        <p className="itinerary-editor__hint">
          点击<strong>列头</strong>或<strong>Day Tab</strong>编辑当日概况；点击<strong>区域轨</strong>管理区域；点击<strong>节点</strong>或<strong>连线</strong>编辑详情。
        </p>
        <div className="itinerary-editor__scroll">
          <ItineraryFormEditor focus={focus} dayIndex={dayIndex} regionName={regionName} />
        </div>
      </div>
    );
  }

  const { dayIndex, node } = nodeCtx;
  const day = itinerary.days[dayIndex];
  const { outgoing, incoming } = listEdgesForNode(day, node.id);

  const peerNodes = day.nodes.filter((n) => n.id !== node.id);

  const outEdge = outgoing.find((e) => e.type === 'primary') ?? outgoing[0];
  const inEdge = incoming.find((e) => e.type === 'primary') ?? incoming[0];

  const outCandidates = peerNodes.filter(
    (n) => !outgoing.some((e) => e.to === n.id && e.type === 'primary'),
  );

  const inCandidates = peerNodes.filter(
    (n) => !incoming.some((e) => e.from === n.id && e.type === 'primary'),
  );

  const handleAddOutEdge = (targetId: string) => {
    if (!targetId) return;
    connectNodes(dayIndex, node.id, targetId);
  };

  const handleAddInEdge = (sourceId: string) => {
    if (!sourceId) return;
    connectNodes(dayIndex, sourceId, node.id);
  };

  const handleDelete = () => {
    removeNode(dayIndex, node.id);
    selectNode(null);
  };

  const handleRemoveEdge = (edgeId: string) => {
    removeEdge(dayIndex, edgeId);
  };

  return (
    <div className="itinerary-editor itinerary-editor--active">
      <div className="itinerary-editor__head">
        <span>Day {day?.day_index}</span>
        {day?.date && <span>{day.date}</span>}
        {day?.region && <span>{day.region}</span>}
      </div>

      <div className="itinerary-editor__scroll">
        <FormSection title="基础">
          <FormField label="名称">
            <FormInput
              value={node.name}
              onChange={(e) => updateNode(dayIndex, node.id, { name: e.target.value })}
            />
          </FormField>
          <FormField label="类型">
            <FormSelect
              value={node.category}
              onChange={(e) =>
                updateNode(dayIndex, node.id, { category: e.target.value as NodeCategory })
              }
            >
              {CATEGORY_OPTIONS.map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.icon} {meta.label}
                </option>
              ))}
            </FormSelect>
          </FormField>
          <RegionCombobox
            value={node.region}
            options={regionOptions}
            inheritLabel={day?.region ?? '其他'}
            inputId={`node-region-${node.id}`}
            onChange={(region) => updateNode(dayIndex, node.id, { region })}
          />
          <FormField label="场景分组">
            <FormInput
              value={node.scene_group ?? ''}
              placeholder="如：樟宜机场（同组节点显示虚线框）"
              list={`scene-group-presets-${node.id}`}
              onChange={(e) =>
                updateNode(dayIndex, node.id, {
                  scene_group: e.target.value.trim() || undefined,
                })
              }
            />
            <datalist id={`scene-group-presets-${node.id}`}>
              {sceneGroupPresets.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            {node.scene_group && (
              <p className="itinerary-editor__field-hint">
                与同组至少 1 个节点共享「{node.scene_group}」时显示虚线框
              </p>
            )}
          </FormField>
          <FormField label="注意事项">
            <TipsEditor
              value={node.tips ?? []}
              presets={tipPresets}
              onChange={(tips) => {
                const cleaned = tips.map((s) => s.trim()).filter(Boolean);
                updateNode(dayIndex, node.id, { tips: cleaned.length ? cleaned : undefined });
              }}
            />
          </FormField>
        </FormSection>

        <FormSection title="位置">
          <FormField label="地址">
            <FormInput
              value={node.address ?? ''}
              placeholder="街道或商场名称"
              onChange={(e) =>
                updateNode(dayIndex, node.id, { address: e.target.value || undefined })
              }
            />
          </FormField>
          <FormField label="楼层">
            <FormInput
              value={node.floor ?? ''}
              placeholder="L1 / 3F"
              onChange={(e) =>
                updateNode(dayIndex, node.id, { floor: e.target.value || undefined })
              }
            />
          </FormField>
          <NodeCoordEditor
            node={node}
            destination={destination}
            onApply={(patch) => updateNode(dayIndex, node.id, patch)}
          />
        </FormSection>

        <FormSection title="时间">
          <FormRow>
            <FormField label="开始">
              <TimePicker
                value={node.start_time}
                onChange={(v) => updateNode(dayIndex, node.id, { start_time: v })}
              />
            </FormField>
            <FormField label="结束">
              <TimePicker
                value={node.end_time}
                onChange={(v) => updateNode(dayIndex, node.id, { end_time: v })}
              />
            </FormField>
          </FormRow>
          <FormCheckbox
            label="备选节点"
            checked={node.is_optional}
            onChange={(e) => updateNode(dayIndex, node.id, { is_optional: e.target.checked })}
          />
        </FormSection>

        <FormSection title="开销">
          <FormField label="展示文案">
            <FormInput
              value={node.cost_label ?? ''}
              placeholder="约 80 元/人、免费"
              onChange={(e) =>
                updateNode(dayIndex, node.id, {
                  cost_label: e.target.value.trim() || undefined,
                })
              }
            />
          </FormField>
          <FormRow>
            <FormField label="金额">
              <FormNumberInput
                value={node.cost?.amount ?? ''}
                placeholder="80"
                onChange={(e) => {
                  const amount = e.target.value === '' ? undefined : Number(e.target.value);
                  const cost: NodeCost = { ...node.cost, amount };
                  updateNode(dayIndex, node.id, {
                    cost: Object.keys(cost).some((k) => cost[k as keyof NodeCost] != null)
                      ? cost
                      : undefined,
                  });
                }}
              />
            </FormField>
            <FormField label="币种">
              <FormInput
                value={node.cost?.currency ?? ''}
                placeholder="CNY / SGD"
                onChange={(e) => {
                  const currency = e.target.value.trim().toUpperCase() || undefined;
                  updateNode(dayIndex, node.id, {
                    cost: { ...node.cost, currency },
                  });
                }}
              />
            </FormField>
          </FormRow>
        </FormSection>

        <FormSection title="标签">
          <TagPicker
            value={node.tags ?? []}
            presets={tagPresets}
            onChange={(tags) =>
              updateNode(dayIndex, node.id, { tags: tags.length ? tags : undefined })
            }
          />
        </FormSection>

        <FormSection title="连接">
          <EdgeConnectGroup
            label="出边"
            direction="out"
            emptyHint="暂无可连接节点"
            peerNodes={peerNodes}
            candidates={outCandidates}
            connected={outEdge ? { edgeId: outEdge.id, nodeId: outEdge.to } : undefined}
            placeholder="选择目标节点…"
            onAdd={handleAddOutEdge}
            onRemove={handleRemoveEdge}
          />
          <EdgeConnectGroup
            label="入边"
            direction="in"
            emptyHint="暂无可连接节点"
            peerNodes={peerNodes}
            candidates={inCandidates}
            connected={inEdge ? { edgeId: inEdge.id, nodeId: inEdge.from } : undefined}
            placeholder="选择来源节点…"
            onAdd={handleAddInEdge}
            onRemove={handleRemoveEdge}
          />
        </FormSection>
      </div>

      <div className="itinerary-editor__footer">
        <button type="button" className="form-btn form-btn--danger" onClick={handleDelete}>
          删除节点
        </button>
      </div>
    </div>
  );
}
