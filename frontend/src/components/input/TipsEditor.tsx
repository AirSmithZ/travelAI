import { useState, type KeyboardEvent } from 'react';
import './TipsEditor.css';

interface TipsEditorProps {
  value: string[];
  presets: string[];
  onChange: (tips: string[]) => void;
}

export function TipsEditor({ value, presets, onChange }: TipsEditorProps) {
  const [draft, setDraft] = useState('');

  const addTip = (text: string) => {
    const tip = text.trim();
    if (!tip || value.includes(tip)) return;
    onChange([...value, tip]);
  };

  const removeTip = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateTip = (index: number, text: string) => {
    const next = [...value];
    next[index] = text;
    onChange(next);
  };

  const moveTip = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTip(draft);
      setDraft('');
    }
  };

  const unselectedPresets = presets.filter((p) => !value.includes(p));

  return (
    <div className="tips-editor">
      <p className="tips-editor__unverified" role="note">
        提示与开放时间等尚未联网核实，请以官方信息为准
      </p>
      {value.length > 0 && (
        <ul className="tips-editor__list">
          {value.map((tip, index) => (
            <li key={`${index}-${tip.slice(0, 12)}`} className="tips-editor__row">
              <div className="tips-editor__reorder">
                <button
                  type="button"
                  className="tips-editor__move"
                  disabled={index === 0}
                  onClick={() => moveTip(index, -1)}
                  title="上移"
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="tips-editor__move"
                  disabled={index === value.length - 1}
                  onClick={() => moveTip(index, 1)}
                  title="下移"
                  aria-label="下移"
                >
                  ↓
                </button>
              </div>
              <input
                className="form-control tips-editor__input"
                value={tip}
                placeholder="输入提示内容…"
                onChange={(e) => updateTip(index, e.target.value)}
              />
              <button
                type="button"
                className="tips-editor__remove"
                onClick={() => removeTip(index)}
                title="删除"
                aria-label="删除"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {unselectedPresets.length > 0 && (
        <div className="tips-editor__presets">
          <span className="tips-editor__presets-label">常用</span>
          {unselectedPresets.map((tip) => (
            <button
              key={tip}
              type="button"
              className="tips-editor__preset"
              onClick={() => addTip(tip)}
            >
              {tip}
            </button>
          ))}
        </div>
      )}

      <div className="tips-editor__add">
        <input
          className="form-control tips-editor__input"
          value={draft}
          placeholder="添加提示，如：建议提前预约"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="form-btn form-btn--sm"
          onClick={() => {
            addTip(draft);
            setDraft('');
          }}
          disabled={!draft.trim()}
        >
          添加
        </button>
      </div>
    </div>
  );
}
