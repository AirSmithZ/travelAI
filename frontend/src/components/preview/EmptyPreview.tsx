import './EmptyPreview.css';

interface EmptyPreviewProps {
  type: 'graph' | 'map';
  phase: 'empty' | 'planning' | 'detailed';
}

export function EmptyPreview({ type, phase }: EmptyPreviewProps) {
  const isMap = type === 'map';
  return (
    <div className="empty-preview">
      <div className="empty-preview__icon">{isMap ? '◎' : '◇'}</div>
      <h3 className="empty-preview__title">
        {phase === 'empty' ? '路线预览' : '确认需求后生成'}
      </h3>
      <p className="empty-preview__desc">
        {isMap ? '生成后显示地图标点' : '在左侧对话确认后生成行程'}
      </p>
    </div>
  );
}
