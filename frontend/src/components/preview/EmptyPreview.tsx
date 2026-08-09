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
        {phase === 'empty' ? '路线预览' : '生成玩法后显示'}
      </h3>
      <p className="empty-preview__desc">
        {isMap
          ? '确认航班与住宿后生成玩法，地图将显示行程点；有片区推荐时可先看片区圈'
          : '在左侧对话完善需求，确认机酒后生成路线图'}
      </p>
    </div>
  );
}
