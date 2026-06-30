import type { ReactNode } from 'react';
import '../graph/SceneGroupNode.css';
import './OverviewSceneGroup.css';

interface OverviewSceneGroupProps {
  label: string;
  children: ReactNode;
}

export function OverviewSceneGroup({ label, children }: OverviewSceneGroupProps) {
  return (
    <div className="overview-scene-group scene-group-node">
      <span className="scene-group-node__label">{label}</span>
      <div className="overview-scene-group__inner">{children}</div>
    </div>
  );
}
