import React, { useState, useRef, useEffect } from 'react';
import { useTravel } from '../../context/TravelContext';
import Button from '../ui/Button';
import { Send } from 'lucide-react';

const ChatPanel = () => {
  const { chatHistory, addChatMessage, setItinerary, itinerary, preferences } = useTravel();
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

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
    <div className="h-full bg-transparent flex flex-col">

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/20" ref={scrollRef}>
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-r from-sky-400 to-emerald-400 text-slate-950 rounded-br-none' 
                  : 'bg-slate-950/25 border border-slate-800/70 text-slate-100 rounded-bl-none shadow-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-900/40 border-t border-slate-800/70">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
            {suggestions.map((s, i) => (
              <button 
                key={i}
                onClick={() => setInput(s)}
                className="whitespace-nowrap px-3 py-1 rounded-full bg-slate-950/25 border border-slate-800/70 text-xs text-slate-200 hover:bg-sky-500/10 hover:border-sky-400/40 transition-colors"
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
              placeholder="✨ 输入你的需求，例如：帮我找一家附近的咖啡馆…"
              className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-800/70 bg-slate-950/25 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-sky-400/20 focus:border-sky-400/50 text-sm shadow-sm outline-none"
            />
            <Button 
              size="icon" 
              variant="default"
              className="absolute right-1 top-1 h-9 w-9"
              onClick={handleSend}
            >
              <Send size={14} />
            </Button>
          </div>
      </div>
    </div>
  );
};

export default ChatPanel;
