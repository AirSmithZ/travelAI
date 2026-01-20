import React from 'react';
import { useTravel } from '../../context/TravelContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { MapPin, Clock, Trash2, GripVertical, Plus } from 'lucide-react';
import Button from '../ui/Button';

const ItineraryPanel = () => {
  const { itinerary, updateItineraryOrder, removePoi, setSelectedPoi, setMapCenter } = useTravel();

  const onDragEnd = (result) => {
    const { source, destination } = result;

    // 如果没有目的地或位置没变，直接返回
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // 获取源日期和目标日期的 key
    const sourceDay = source.droppableId;
    const destDay = destination.droppableId;

    // 复制当前的行程数据
    const sourceItems = Array.from(itinerary[sourceDay] || []);
    const destItems = sourceDay === destDay ? sourceItems : Array.from(itinerary[destDay] || []);

    // 移除拖拽项
    const [removed] = sourceItems.splice(source.index, 1);

    // 插入到新位置
    destItems.splice(destination.index, 0, removed);

    // 更新状态
    if (sourceDay === destDay) {
      updateItineraryOrder(sourceDay, sourceItems);
    } else {
      updateItineraryOrder(sourceDay, sourceItems);
      updateItineraryOrder(destDay, destItems);
    }
  };

  const handlePoiClick = (poi) => {
    setSelectedPoi(poi);
    if (typeof poi.lat === 'number' && typeof poi.lng === 'number') {
      setMapCenter([poi.lat, poi.lng]);
    }
  };

  return (
    <div className="h-full bg-slate-950/80 border-r border-slate-800 overflow-y-auto w-full md:w-[320px] flex-shrink-0 backdrop-blur-xl">
      <div className="p-4 border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10">
        <h2 className="font-bold text-lg text-slate-50">行程安排</h2>
        <p className="text-xs text-slate-400 mt-1">拖拽卡片调整顺序</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="p-4 space-y-6">
          {Object.keys(itinerary).sort().map((dayKey, index) => {
            const dayItems = Array.isArray(itinerary[dayKey]) ? itinerary[dayKey] : [];
            return (
              <div key={dayKey} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-100 flex items-center gap-2">
                    <span className="bg-slate-800 text-slate-200 w-6 h-6 rounded flex items-center justify-center text-xs">
                      {index + 1}
                    </span>
                    第 {index + 1} 天
                  </h3>
                  <span className="text-xs text-slate-500">
                    {dayItems.length} 个地点
                  </span>
                </div>

                <Droppable droppableId={dayKey}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={`space-y-2 min-h-[50px] rounded-lg transition-colors ${
                        snapshot.isDraggingOver ? 'bg-sky-500/10 ring-2 ring-sky-500/40' : 'bg-slate-900/40'
                      }`}
                    >
                      {dayItems.map((poi, idx) => (
                        <Draggable key={poi.uniqueId} draggableId={poi.uniqueId} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-slate-900/80 p-3 rounded-lg border shadow-sm group hover:shadow-lg transition-all ${
                                snapshot.isDragging
                                  ? 'shadow-xl ring-2 ring-sky-500/80 border-transparent scale-[1.02]'
                                  : 'border-slate-800'
                              }`}
                              onClick={() => handlePoiClick(poi)}
                            >
                              <div className="flex gap-3">
                                <div
                                  {...provided.dragHandleProps}
                                  className="text-slate-600 hover:text-slate-300 cursor-grab active:cursor-grabbing flex items-center"
                                >
                                  <GripVertical size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-semibold text-sm text-slate-50 truncate">{poi.name}</h4>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removePoi(dayKey, poi.uniqueId);
                                      }}
                                      className="text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                                    <span className="flex items-center gap-1 bg-slate-800/80 px-1.5 py-0.5 rounded">
                                      <MapPin size={10} /> {poi.category}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock size={10} /> {poi.duration} min
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {/* Add Button Placeholder */}
                      <button className="w-full py-2 border border-dashed border-slate-700 rounded-lg text-slate-500 text-xs hover:border-sky-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors flex items-center justify-center gap-1">
                        <Plus size={14} /> 添加地点
                      </button>
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
};

export default ItineraryPanel;
