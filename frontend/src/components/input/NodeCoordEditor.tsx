import { useCallback, useEffect, useRef, useState } from 'react';
import { geocodeAutocomplete, GeocodeApiError, type GeocodeCandidate } from '../../api/geocode';
import type { ItineraryNode } from '../../types/itinerary';
import { usePlanStore } from '../../stores/usePlanStore';
import {
  buildNodeCoordsPatch,
  COORD_CONFIDENCE_LABEL,
  COORD_CONFIDENCE_TONE,
} from '../../utils/applyNodeCoords';
import { FormField, FormInput, FormRow } from '../ui/FormField';
import './NodeCoordEditor.css';

const MIN_QUERY_LEN = 2;
/** GEO-05: typing debounce for autocomplete (P65 / docs 问题日志) */
const SEARCH_DEBOUNCE_MS = 400;

interface NodeCoordEditorProps {
  node: ItineraryNode;
  destination: string;
  onApply: (patch: Partial<ItineraryNode>) => void;
}

export function NodeCoordEditor({ node, destination, onApply }: NodeCoordEditorProps) {
  const startMapPick = usePlanStore((s) => s.startMapPick);
  const cancelMapPick = usePlanStore((s) => s.cancelMapPick);
  const mapPickNodeId = usePlanStore((s) => s.mapPickNodeId);
  const isPicking = mapPickNodeId === node.id;
  const [query, setQuery] = useState(node.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [preview, setPreview] = useState<GeocodeCandidate | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLat, setManualLat] = useState(String(node.lat));
  const [manualLng, setManualLng] = useState(String(node.lng));
  const [providerHint, setProviderHint] = useState<string | null>(null);
  const requestSeq = useRef(0);
  /** Skip debounce once after node sync so we don't auto-hit API on open */
  const skipDebounceRef = useRef(true);

  useEffect(() => {
    skipDebounceRef.current = true;
    setQuery(node.name);
    setManualLat(String(node.lat));
    setManualLng(String(node.lng));
    setPreview(null);
    setCandidates([]);
    setError(null);
    setProviderHint(null);
  }, [node.id, node.name, node.lat, node.lng]);

  const selectCandidate = useCallback((candidate: GeocodeCandidate) => {
    setPreview(candidate);
    setManualLat(String(candidate.lat));
    setManualLng(String(candidate.lng));
    setError(null);
  }, []);

  const runSearch = useCallback(
    async (q: string, { manual = false }: { manual?: boolean } = {}) => {
      const trimmed = q.trim();
      if (trimmed.length < MIN_QUERY_LEN) {
        if (manual) setError(`请输入至少 ${MIN_QUERY_LEN} 个字符`);
        setCandidates([]);
        setPreview(null);
        setProviderHint(null);
        return;
      }

      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      if (manual) {
        setPreview(null);
        setCandidates([]);
      }

      try {
        const data = await geocodeAutocomplete(trimmed, destination);
        if (seq !== requestSeq.current) return;

        setProviderHint(data.provider ? `数据源：${data.provider}` : null);

        if (data.results.length === 0) {
          setCandidates([]);
          setPreview(null);
          const warn = data.warnings?.[0];
          setError(warn ?? '未找到匹配地点，请调整关键词或改用手动/地图选点');
          return;
        }

        setCandidates(data.results);
        setError(null);
        if (data.results.length === 1) {
          selectCandidate(data.results[0]);
        }
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setCandidates([]);
        setPreview(null);
        setProviderHint(null);
        const msg =
          err instanceof GeocodeApiError
            ? err.message
            : '搜索失败，请检查后端连接或改用手动输入';
        setError(msg);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [destination, selectCandidate],
  );

  useEffect(() => {
    if (skipDebounceRef.current) {
      skipDebounceRef.current = false;
      return;
    }
    const handle = window.setTimeout(() => {
      void runSearch(query);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, runSearch]);

  const applyPreview = () => {
    if (!preview) return;
    onApply(
      buildNodeCoordsPatch(preview.lat, preview.lng, {
        address: preview.address || undefined,
        source: preview.coord_source,
        place_id: preview.place_id || undefined,
      }),
    );
    setPreview(null);
    setCandidates([]);
    setError(null);
  };

  const applyManual = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('请输入有效的经纬度数字');
      return;
    }
    onApply(buildNodeCoordsPatch(lat, lng));
    setError(null);
    setPreview(null);
    setCandidates([]);
  };

  const confidence = node.coord_confidence ?? 'none';
  const tone = COORD_CONFIDENCE_TONE[confidence];

  return (
    <div className="node-coord-editor">
      <div className="node-coord-editor__status">
        <span className={`node-coord-editor__dot node-coord-editor__dot--${tone}`} />
        <span className="node-coord-editor__conf">{COORD_CONFIDENCE_LABEL[confidence]}</span>
        <span className="node-coord-editor__current">
          {node.lat.toFixed(5)}, {node.lng.toFixed(5)}
        </span>
      </div>

      <FormField label="搜索地点">
        <div className="node-coord-editor__search-wrap">
          <FormInput
            value={query}
            placeholder="输入后自动联想，或点立即搜索"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void runSearch(query, { manual: true });
              }
            }}
          />
          {loading && <span className="node-coord-editor__search-loading">搜索中…</span>}
        </div>
        <p className="node-coord-editor__search-hint">停顿约 0.4s 自动联想候选；也可 Enter / 立即搜索</p>
      </FormField>

      <div className="form-btn-row">
        <button
          type="button"
          className="form-btn form-btn--primary form-btn--sm"
          onClick={() => void runSearch(query, { manual: true })}
          disabled={loading || query.trim().length < MIN_QUERY_LEN}
        >
          立即搜索
        </button>
        <button
          type="button"
          className={`form-btn form-btn--sm${isPicking ? ' form-btn--active' : ''}`}
          onClick={() => (isPicking ? cancelMapPick() : startMapPick(node.id))}
        >
          {isPicking ? '取消选点' : '在地图上选点'}
        </button>
        <button
          type="button"
          className="form-btn form-btn--sm"
          onClick={() => setManualOpen((v) => !v)}
        >
          {manualOpen ? '收起手动输入' : '手动输入'}
        </button>
      </div>

      {providerHint && !error && (
        <p className="node-coord-editor__provider-hint">{providerHint}</p>
      )}

      {isPicking && (
        <p className="node-coord-editor__pick-hint">已切换到地图，点击地图落点并确认坐标</p>
      )}

      {error && <p className="node-coord-editor__error">{error}</p>}

      {candidates.length > 0 && (
        <ul className="node-coord-editor__candidates" role="listbox" aria-label="地点候选">
          {candidates.map((c) => (
            <li key={c.place_id || `${c.lat}-${c.lng}-${c.name}`}>
              <button
                type="button"
                role="option"
                className={`node-coord-editor__candidate${
                  preview?.place_id === c.place_id && preview?.lat === c.lat
                    ? ' node-coord-editor__candidate--active'
                    : ''
                }`}
                onClick={() => selectCandidate(c)}
              >
                <span className="node-coord-editor__candidate-name">{c.name}</span>
                <span className="node-coord-editor__candidate-addr">{c.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <div className="node-coord-editor__preview">
          <p className="node-coord-editor__preview-addr">{preview.address || preview.name}</p>
          <p className="node-coord-editor__preview-coord">
            {preview.lat.toFixed(5)}, {preview.lng.toFixed(5)}
          </p>
          <button type="button" className="form-btn form-btn--primary form-btn--sm" onClick={applyPreview}>
            确认应用坐标
          </button>
        </div>
      )}

      {manualOpen && (
        <div className="node-coord-editor__manual">
          <FormRow>
            <FormField label="纬度">
              <FormInput
                value={manualLat}
                inputMode="decimal"
                onChange={(e) => setManualLat(e.target.value)}
              />
            </FormField>
            <FormField label="经度">
              <FormInput
                value={manualLng}
                inputMode="decimal"
                onChange={(e) => setManualLng(e.target.value)}
              />
            </FormField>
          </FormRow>
          <button type="button" className="form-btn form-btn--sm" onClick={applyManual}>
            应用手动坐标
          </button>
        </div>
      )}
    </div>
  );
}
