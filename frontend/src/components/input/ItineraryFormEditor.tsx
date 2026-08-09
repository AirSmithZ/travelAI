import { useEffect, useMemo, useState } from 'react';
import { usePlanStore, selectActiveItinerary } from '../../stores/usePlanStore';
import { isDayDateOrderInconsistent } from '../../utils/dateUtils';
import { countNodesInRegion } from '../../utils/regionMutations';
import { DayWeatherEditor } from './DayWeatherEditor';
import { FormDateInput, FormField, FormInput, FormSection } from '../ui/FormField';

interface FormDaySectionProps {
  dayIndex: number;
}

function FormDaySection({ dayIndex }: FormDaySectionProps) {
  const itinerary = usePlanStore(selectActiveItinerary);
  const setDayRegion = usePlanStore((s) => s.setDayRegion);
  const setDayDate = usePlanStore((s) => s.setDayDate);
  const updateDayWeather = usePlanStore((s) => s.updateDayWeather);
  const addDay = usePlanStore((s) => s.addDay);
  const insertDayAfter = usePlanStore((s) => s.insertDayAfter);
  const removeDay = usePlanStore((s) => s.removeDay);
  const sortDaysByDate = usePlanStore((s) => s.sortDaysByDate);
  const selectDay = usePlanStore((s) => s.selectDay);
  const day = itinerary?.days[dayIndex];

  const dateOrderInconsistent = useMemo(() => {
    if (!itinerary) return false;
    return isDayDateOrderInconsistent(itinerary.days.map((d) => d.date ?? ''));
  }, [itinerary]);

  if (!day) return null;

  const handleInsertAfter = () => {
    const newIndex = insertDayAfter(dayIndex);
    if (newIndex >= 0) selectDay(newIndex);
  };

  const handleAppendDay = () => {
    const newIndex = addDay();
    if (newIndex >= 0) selectDay(newIndex);
  };

  const handleRemoveDay = () => {
    const nodeCount = day.nodes.length;
    if (nodeCount > 0) {
      const ok = window.confirm(
        `Day ${day.day_index} 含 ${nodeCount} 个节点，删除后不可恢复（可撤销）。确定删除？`,
      );
      if (!ok) return;
    }
    if (removeDay(dayIndex)) {
      selectDay(Math.max(0, dayIndex - 1));
    }
  };

  return (
    <>
      <FormSection title="当日概况">
        <FormField label="日期">
          <FormDateInput
            value={day.date ?? ''}
            onChange={(next) => {
              if (next) setDayDate(dayIndex, next);
            }}
          />
          {day.weekday && <span className="form-field__hint">{day.weekday}</span>}
        </FormField>
        {dateOrderInconsistent && (
          <div className="itinerary-form-editor__date-warning">
            <p className="itinerary-editor__field-hint">
              部分天的日期与列序不一致
            </p>
            <button type="button" className="form-btn form-btn--sm" onClick={sortDaysByDate}>
              按日期排序
            </button>
          </div>
        )}
        <FormField label="主区域">
          <FormInput
            value={day.region ?? ''}
            placeholder="如：樟宜区"
            onChange={(e) => setDayRegion(dayIndex, e.target.value)}
          />
        </FormField>
        <p className="itinerary-editor__field-hint">
          主区域仅影响当日摘要与默认落格；改区域轨行名请在「区域管理」中操作
        </p>
      </FormSection>

      <DayWeatherEditor
        weather={day.weather}
        onChange={(partial) => updateDayWeather(dayIndex, partial)}
      />

      <div className="day-editor__footer">
        <div className="form-btn-row">
          <button type="button" className="form-btn" onClick={handleInsertAfter}>
            在此天后插入
          </button>
          <button type="button" className="form-btn" onClick={handleAppendDay}>
            末尾追加一天
          </button>
          <button
            type="button"
            className="form-btn form-btn--danger"
            onClick={handleRemoveDay}
            disabled={(itinerary?.days.length ?? 0) <= 1}
          >
            删除当日
          </button>
        </div>
      </div>
    </>
  );
}

interface FormRegionSectionProps {
  regionName: string;
}

function FormRegionSection({ regionName }: FormRegionSectionProps) {
  const itinerary = usePlanStore(selectActiveItinerary);
  const activeDayIndex = usePlanStore((s) => s.activeDayIndex);
  const renameRegion = usePlanStore((s) => s.renameRegion);
  const addRegion = usePlanStore((s) => s.addRegion);

  const [draft, setDraft] = useState(regionName);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    setDraft(regionName);
  }, [regionName]);

  const nodeCount = useMemo(
    () => (itinerary ? countNodesInRegion(itinerary, regionName) : 0),
    [itinerary, regionName],
  );

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== regionName) {
      renameRegion(regionName, trimmed);
    } else {
      setDraft(regionName);
    }
  };

  const handleCreate = () => {
    if (addRegion(newName, activeDayIndex)) {
      setNewName('');
    }
  };

  return (
    <>
      <FormSection title="区域管理">
        <p className="itinerary-editor__field-hint">
          重命名将同步全行程所有匹配的 day.region 与 node.region
        </p>
        <FormField label="区域名称">
          <FormInput
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
              }
            }}
          />
        </FormField>
        <p className="region-editor__meta">共 {nodeCount} 个节点落在此区域</p>
      </FormSection>

      <FormSection title="新建区域">
        <FormField label="名称">
          <FormInput
            value={newName}
            placeholder="如：圣淘沙"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
        </FormField>
        <button
          type="button"
          className="form-btn form-btn--ghost"
          disabled={!newName.trim()}
          onClick={handleCreate}
        >
          ＋ 新建区域
        </button>
      </FormSection>
    </>
  );
}

export interface ItineraryFormEditorProps {
  focus: 'day' | 'region';
  dayIndex: number;
  regionName?: string;
}

/** 行程公共表单：Day 概况 + 区域管理（非节点/连线） */
export function ItineraryFormEditor({ focus, dayIndex, regionName }: ItineraryFormEditorProps) {
  return (
    <div className="itinerary-form-editor">
      {focus === 'region' && regionName ? (
        <FormRegionSection regionName={regionName} />
      ) : (
        <FormDaySection dayIndex={dayIndex} />
      )}
    </div>
  );
}
