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
        {phase === 'empty' ? '开始规划你的旅程' : '通过对话确认需求后生成'}
      </h3>
      <p className="empty-preview__desc">
        {isMap
          ? '生成行程后，地图将展示标点与路线。'
          : '通过对话描述需求并确认解析结果，再点击「生成行程」。生成后可在下方编辑节点。'}
      </p>
    </div>
  );
}
