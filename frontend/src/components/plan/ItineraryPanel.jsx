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
    setMapCenter([poi.lat, poi.lng]);
  };

  return (
    <div className="h-full bg-slate-50 border-r border-slate-200 overflow-y-auto w-full md:w-[320px] flex-shrink-0">
      <div className="p-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <h2 className="font-bold text-lg text-slate-800">行程安排</h2>
        <p className="text-xs text-slate-500 mt-1">拖拽卡片调整顺序</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="p-4 space-y-6">
          {Object.keys(itinerary).sort().map((dayKey, index) => {
            const dayItems = itinerary[dayKey];
            return (
              <div key={dayKey} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <span className="bg-slate-200 text-slate-600 w-6 h-6 rounded flex items-center justify-center text-xs">
                      {index + 1}
                    </span>
                    第 {index + 1} 天
                  </h3>
                  <span className="text-xs text-slate-400">
                    {dayItems.length} 个地点
                  </span>
                </div>

                <Droppable droppableId={dayKey}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={`space-y-2 min-h-[50px] rounded-lg transition-colors ${
                        snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20' : ''
                      }`}
                    >
                      {dayItems.map((poi, idx) => (
                        <Draggable key={poi.uniqueId} draggableId={poi.uniqueId} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-white p-3 rounded-lg border shadow-sm group hover:shadow-md transition-all ${
                                snapshot.isDragging ? 'shadow-lg ring-2 ring-primary rotate-1' : 'border-slate-200'
                              }`}
                              onClick={() => handlePoiClick(poi)}
                            >
                              <div className="flex gap-3">
                                <div 
                                  {...provided.dragHandleProps}
                                  className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex items-center"
                                >
                                  <GripVertical size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start">
                                    <h4 className="font-semibold text-sm text-slate-800 truncate">{poi.name}</h4>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removePoi(dayKey, poi.uniqueId);
                                      }}
                                      className="text-slate-300 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                    <span className="flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded">
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
                      <button className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-slate-400 text-xs hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-1">
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
