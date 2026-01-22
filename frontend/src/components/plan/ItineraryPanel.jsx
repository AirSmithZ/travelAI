import React, { useState, useRef, useCallback } from 'react';
import { useTravel } from '../../context/TravelContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  MapPin, Clock, Trash2, GripVertical, Plus, Info, CircleDollarSign, 
  Sunrise, Sun, Moon, ChevronDown, ChevronRight, Calendar
} from 'lucide-react';
import { Tooltip } from 'antd';

const ItineraryPanel = () => {
  const { itinerary, updateItineraryOrder, removePoi, setSelectedPoi, setMapCenter } = useTravel();

  // 折叠状态：{ day1: false, day1::morning: false, ... }
  const [collapsed, setCollapsed] = useState({});
  
  // 滚动容器引用，用于修复拖拽偏移
  const scrollContainerRef = useRef(null);

  const toggleCollapse = (key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 拖拽开始时记录滚动位置
  const onBeforeDragStart = useCallback(() => {
    // 可以在这里添加拖拽开始前的逻辑
  }, []);

  const onDragEnd = (result) => {
    const { source, destination } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const parseId = (id) => {
      const [dayKey, seg] = String(id || '').split('::');
      return { dayKey, seg: seg || 'afternoon' };
    };

    const src = parseId(source.droppableId);
    const dst = parseId(destination.droppableId);

    const getList = (dayKey, seg) => {
      const day = itinerary?.[dayKey];
      if (Array.isArray(day)) return day;
      if (!day || typeof day !== 'object') return [];
      const list = day?.[seg];
      return Array.isArray(list) ? list : [];
    };

    const sourceItems = Array.from(getList(src.dayKey, src.seg));
    const destItems = (src.dayKey === dst.dayKey && src.seg === dst.seg)
      ? sourceItems
      : Array.from(getList(dst.dayKey, dst.seg));

    const [removed] = sourceItems.splice(source.index, 1);
    destItems.splice(destination.index, 0, {
      ...removed,
      timeOfDay: dst.seg,
    });

    if (src.dayKey === dst.dayKey && src.seg === dst.seg) {
      updateItineraryOrder(src.dayKey, sourceItems, src.seg);
    } else {
      updateItineraryOrder(src.dayKey, sourceItems, src.seg);
      updateItineraryOrder(dst.dayKey, destItems, dst.seg);
    }
  };

  const handlePoiClick = (poi) => {
    setSelectedPoi(poi);
    if (typeof poi.lat === 'number' && typeof poi.lng === 'number') {
      setMapCenter([poi.lat, poi.lng]);
    }
  };

  const SEGMENTS = [
    { key: 'morning', label: '早上', icon: Sunrise, color: 'sky', gradient: 'from-sky-500/20 to-cyan-500/10' },
    { key: 'afternoon', label: '下午', icon: Sun, color: 'amber', gradient: 'from-amber-500/20 to-orange-500/10' },
    { key: 'evening', label: '晚上', icon: Moon, color: 'indigo', gradient: 'from-indigo-500/20 to-purple-500/10' },
  ];

  const normalizeDay = (dayValue) => {
    if (Array.isArray(dayValue)) {
      return { morning: dayValue, afternoon: [], evening: [] };
    }
    if (!dayValue || typeof dayValue !== 'object') {
      return { morning: [], afternoon: [], evening: [] };
    }
    return {
      morning: Array.isArray(dayValue.morning) ? dayValue.morning : [],
      afternoon: Array.isArray(dayValue.afternoon) ? dayValue.afternoon : [],
      evening: Array.isArray(dayValue.evening) ? dayValue.evening : [],
    };
  };

  const renderNotesTooltip = (poi) => {
    const notes = Array.isArray(poi?.notes) ? poi.notes : [];
    const fallback = poi?.description ? [poi.description] : [];
    const contentList = (notes.length ? notes : fallback).filter(Boolean);
    if (!contentList.length) return null;
    return (
      <div className="max-w-xs space-y-1">
        <div className="text-[11px] text-slate-300/90 font-semibold mb-1">📋 注意事项</div>
        <ul className="list-disc pl-4 space-y-1">
          {contentList.slice(0, 6).map((t, i) => (
            <li key={i} className="text-[11px] text-slate-200/90 leading-snug">{String(t)}</li>
          ))}
        </ul>
        {contentList.length > 6 && (
          <div className="text-[10px] text-slate-400/90">还有 {contentList.length - 6} 条…</div>
        )}
      </div>
    );
  };

  const getCategoryStyle = (category) => {
    if (category === '美食') return { bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30' };
    if (category === '住宿') return { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' };
    if (category === '机场') return { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' };
    return { bg: 'bg-sky-500/15', text: 'text-sky-300', border: 'border-sky-500/30' }; // 景点
  };

  const dayKeys = Object.keys(itinerary).sort();

  return (
    <div 
      ref={scrollContainerRef}
      className="h-full bg-slate-950/90 border-r border-slate-800/50 overflow-y-auto w-full md:w-[340px] flex-shrink-0 backdrop-blur-xl"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800/50 bg-gradient-to-r from-slate-900/95 to-slate-950/95 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Calendar size={18} className="text-white" />
          </div>
          <div>
            <h2 className="font-bold text-base text-slate-50">行程安排</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">拖拽卡片调整顺序</p>
          </div>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd} onBeforeDragStart={onBeforeDragStart}>
        <div className="p-3 space-y-3">
          {dayKeys.length === 0 && (
            <div className="text-center py-12">
              <Calendar size={40} className="text-slate-800 mx-auto mb-3" />
              <div className="text-sm text-slate-600">暂无行程</div>
              <div className="text-[11px] text-slate-700 mt-1">生成行程后将在这里显示</div>
            </div>
          )}

          {dayKeys.map((dayKey, index) => {
            const day = normalizeDay(itinerary[dayKey]);
            const dayCount = day.morning.length + day.afternoon.length + day.evening.length;
            const isDayCollapsed = collapsed[dayKey];

            return (
              <div 
                key={dayKey} 
                className="rounded-2xl border border-slate-800/50 bg-slate-900/40 overflow-hidden"
              >
                {/* Day Header - 可折叠 */}
                <button
                  type="button"
                  onClick={() => toggleCollapse(dayKey)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-slate-800/40 to-slate-900/40 hover:from-slate-800/60 hover:to-slate-900/60 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow shadow-sky-500/30">
                      {index + 1}
                    </div>
                    <span className="font-semibold text-sm text-slate-100">
                      第 {index + 1} 天
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-full">
                      {dayCount} 项
                    </span>
                    {isDayCollapsed ? (
                      <ChevronRight size={16} className="text-slate-500" />
                    ) : (
                      <ChevronDown size={16} className="text-slate-500" />
                    )}
                  </div>
                </button>

                {/* Day Content */}
                {!isDayCollapsed && (
                  <div className="p-2 space-y-2">
                    {SEGMENTS.map((seg) => {
                      const segItems = day[seg.key] || [];
                      const Icon = seg.icon;
                      const droppableId = `${dayKey}::${seg.key}`;
                      const isSegCollapsed = collapsed[droppableId];

                      return (
                        <div 
                          key={seg.key} 
                          className="rounded-xl border border-slate-800/40 overflow-hidden bg-slate-950/30"
                        >
                          {/* Segment Header - 可折叠 */}
                          <button
                            type="button"
                            onClick={() => toggleCollapse(droppableId)}
                            className={`w-full px-3 py-2 flex items-center justify-between bg-gradient-to-r ${seg.gradient} hover:brightness-110 transition-all`}
                          >
                            <div className="flex items-center gap-2">
                              <div className={`h-6 w-6 rounded-lg bg-${seg.color}-500/20 border border-${seg.color}-500/30 flex items-center justify-center`}>
                                <Icon size={12} className={`text-${seg.color}-400`} />
                              </div>
                              <span className="text-xs font-semibold text-slate-200">{seg.label}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-500">{segItems.length} 项</span>
                              {isSegCollapsed ? (
                                <ChevronRight size={14} className="text-slate-600" />
                              ) : (
                                <ChevronDown size={14} className="text-slate-600" />
                              )}
                            </div>
                          </button>

                          {/* Segment Content */}
                          {!isSegCollapsed && (
                            <Droppable droppableId={droppableId}>
                              {(provided, snapshot) => (
                                <div
                                  {...provided.droppableProps}
                                  ref={provided.innerRef}
                                  className={`p-2 space-y-2 min-h-[40px] transition-colors ${
                                    snapshot.isDraggingOver ? 'bg-sky-500/10' : ''
                                  }`}
                                >
                                  {segItems.map((poi, idx) => {
                                    const costText = poi?.cost || '';
                                    const hasNotes = (Array.isArray(poi?.notes) && poi.notes.length > 0) || Boolean(poi?.description);
                                    const catStyle = getCategoryStyle(poi.category);

                                    return (
                                      <Draggable 
                                        key={poi.uniqueId} 
                                        draggableId={poi.uniqueId} 
                                        index={idx}
                                      >
                                        {(provided, snapshot) => {
                                          // 修复拖拽偏移：当拖拽时，重新计算正确的位置
                                          let style = provided.draggableProps.style;
                                          if (snapshot.isDragging && style) {
                                            // 保持原有的 transform，但添加视觉优化
                                            style = {
                                              ...style,
                                              // 确保使用正确的定位
                                              position: 'fixed',
                                            };
                                          }
                                          
                                          return (
                                          <div
                                            ref={provided.innerRef}
                                            {...provided.draggableProps}
                                            style={style}
                                            className={`bg-slate-900/80 p-3 rounded-xl border transition-shadow ${
                                              snapshot.isDragging
                                                ? 'shadow-2xl ring-2 ring-sky-500/60 border-sky-500/40 z-[9999]'
                                                : 'border-slate-800/60 hover:border-slate-700/60'
                                            }`}
                                            onClick={() => handlePoiClick(poi)}
                                          >
                                            <div className="flex gap-2.5">
                                              {/* Drag Handle */}
                                              <div
                                                {...provided.dragHandleProps}
                                                className="text-slate-700 hover:text-slate-400 cursor-grab active:cursor-grabbing flex items-center pt-0.5"
                                              >
                                                <GripVertical size={14} />
                                              </div>

                                              {/* Content */}
                                              <div className="flex-1 min-w-0">
                                                {/* Title Row */}
                                                <div className="flex justify-between items-start gap-2">
                                                  <h4 className="font-semibold text-[13px] text-slate-100 truncate leading-tight">
                                                    {poi.name}
                                                  </h4>
                                                  <div className="flex items-center gap-1 shrink-0">
                                                    {hasNotes && (
                                                      <Tooltip
                                                        title={renderNotesTooltip(poi)}
                                                        placement="left"
                                                        classNames={{ root: 'tp-tooltip-dark' }}
                                                        color="rgba(15,23,42,0.98)"
                                                      >
                                                        <button
                                                          type="button"
                                                          onClick={(e) => e.stopPropagation()}
                                                          className="h-6 w-6 rounded-lg bg-slate-800/50 text-slate-500 hover:text-sky-400 hover:bg-sky-500/15 transition-colors flex items-center justify-center"
                                                        >
                                                          <Info size={12} />
                                                        </button>
                                                      </Tooltip>
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        removePoi(dayKey, poi.uniqueId, seg.key);
                                                      }}
                                                      className="h-6 w-6 rounded-lg bg-slate-800/50 text-slate-600 hover:text-red-400 hover:bg-red-500/15 transition-colors flex items-center justify-center"
                                                    >
                                                      <Trash2 size={12} />
                                                    </button>
                                                  </div>
                                                </div>

                                                {/* Meta Row */}
                                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${catStyle.bg} ${catStyle.text} border ${catStyle.border}`}>
                                                    <MapPin size={9} />
                                                    {poi.category}
                                                  </span>
                                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-400 bg-slate-800/50">
                                                    <Clock size={9} />
                                                    {poi.duration} min
                                                  </span>
                                                  {costText && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                                                      <CircleDollarSign size={9} />
                                                      {costText}
                                                    </span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                          );
                                        }}
                                      </Draggable>
                                    );
                                  })}

                                  {provided.placeholder}

                                  {/* Add Button */}
                                  <button
                                    type="button"
                                    className="w-full py-1.5 border border-dashed border-slate-800/60 rounded-lg text-slate-600 text-[11px] hover:border-sky-500/50 hover:text-sky-400 hover:bg-sky-500/5 transition-colors flex items-center justify-center gap-1"
                                  >
                                    <Plus size={12} />
                                    添加
                                  </button>
                                </div>
                              )}
                            </Droppable>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
};

export default ItineraryPanel;
