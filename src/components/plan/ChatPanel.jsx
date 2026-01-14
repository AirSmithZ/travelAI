import React, { useState, useRef, useEffect } from 'react';
import { useTravel } from '../../context/TravelContext';
import Button from '../ui/Button';
import { Send, Sparkles, ChevronUp, ChevronDown } from 'lucide-react';

const ChatPanel = () => {
  const { chatHistory, addChatMessage, setItinerary, itinerary, preferences } = useTravel();
  const [input, setInput] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isCollapsed]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    addChatMessage('user', input);
    const userMsg = input;
    setInput('');

    // 模拟 AI 响应
    setTimeout(() => {
      let response = "好的，我已经为您调整了行程。";
      
      if (userMsg.includes("海边") || userMsg.includes("自然")) {
        response = "没问题，我为您在第二天安排了更多自然风光的景点，比如海滩和公园。";
        // 简单的模拟逻辑：这里实际上应该调用 LLM
      } else if (userMsg.includes("预算")) {
        response = "好的，我已经将推荐的餐厅替换为性价比更高的选择，总预算已控制在您的范围内。";
      } else if (userMsg.includes("第二天")) {
        response = "已为您重新规划第二天的路线，现在的行程更加顺路了。";
      }

      addChatMessage('ai', response);
    }, 1000);
  };

  const suggestions = [
    "第二天换成海边行程",
    "把预算降到 5k",
    "推荐一家附近的日料",
    "增加购物时间"
  ];

  return (
    <div className={`bg-white border-b border-slate-200 flex flex-col transition-all duration-300 ${isCollapsed ? 'h-16' : 'h-[35vh] min-h-[250px]'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800">AI 旅行助手</h3>
            {!isCollapsed && <p className="text-xs text-slate-500">随时告诉我您的想法，我会帮您调整</p>}
          </div>
        </div>
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-slate-200 rounded text-slate-500"
        >
          {isCollapsed ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </button>
      </div>

      {/* Chat Area */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30" ref={scrollRef}>
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user' 
                  ? 'bg-primary text-white rounded-br-none' 
                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      {!isCollapsed && (
        <div className="p-4 bg-white border-t border-slate-100">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
            {suggestions.map((s, i) => (
              <button 
                key={i}
                onClick={() => setInput(s)}
                className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-100 text-xs text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="输入您的需求，例如：'帮我找一家附近的咖啡馆'..."
              className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary focus:border-transparent text-sm shadow-sm"
            />
            <Button 
              size="icon" 
              className="absolute right-1 top-1 h-8 w-8 bg-primary hover:bg-primary/90"
              onClick={handleSend}
            >
              <Send size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPanel;
