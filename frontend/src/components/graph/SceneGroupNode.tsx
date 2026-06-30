import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import './SceneGroupNode.css';

export type SceneGroupData = {
  label: string;
};

function SceneGroupNodeComponent({ data }: NodeProps & { data: SceneGroupData }) {
  return (
    <div className="scene-group-node">
      <span className="scene-group-node__label">{data.label}</span>
    </div>
  );
}

export const SceneGroupNode = memo(SceneGroupNodeComponent);
