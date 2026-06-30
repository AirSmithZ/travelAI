import { useState, type KeyboardEvent } from 'react';
import './TagPicker.css';

interface TagPickerProps {
  value: string[];
  presets: string[];
  onChange: (tags: string[]) => void;
}

export function TagPicker({ value, presets, onChange }: TagPickerProps) {
  const [draft, setDraft] = useState('');

  const toggle = (tag: string) => {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  };

  const addCustom = () => {
    const tag = draft.trim();
    if (!tag || value.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustom();
    }
  };

  const unselectedPresets = presets.filter((p) => !value.includes(p));

  return (
    <div className="tag-picker">
      {value.length > 0 && (
        <div className="tag-picker__selected">
          {value.map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag-picker__chip tag-picker__chip--active"
              onClick={() => toggle(tag)}
              title="点击移除"
            >
              {tag}
              <span className="tag-picker__chip-x">×</span>
            </button>
          ))}
        </div>
      )}

      {unselectedPresets.length > 0 && (
        <div className="tag-picker__presets">
          <span className="tag-picker__presets-label">常用</span>
          {unselectedPresets.map((tag) => (
            <button
              key={tag}
              type="button"
              className="tag-picker__chip"
              onClick={() => toggle(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="tag-picker__add">
        <input
          className="form-control tag-picker__input"
          value={draft}
          placeholder="输入新标签…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="form-btn form-btn--sm"
          onClick={addCustom}
          disabled={!draft.trim()}
        >
          添加
        </button>
      </div>
    </div>
  );
}
