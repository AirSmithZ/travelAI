import {
  COLUMN_HEADER_HEIGHT,
  EMPTY_CELL_HEIGHT,
  type OverviewLayout,
} from '../../utils/layoutOverview';
import './RegionRail.css';

interface RegionRailProps {
  layout: OverviewLayout;
}

export function RegionRail({ layout }: RegionRailProps) {
  let rowOffset = 0;

  return (
    <div
      className="region-rail"
      style={{ width: layout.railWidth, height: layout.height }}
    >
      <div className="region-rail__header" style={{ height: COLUMN_HEADER_HEIGHT }} />
      {layout.regions.map((region) => {
        const rowH = layout.regionHeights.get(region) ?? EMPTY_CELL_HEIGHT;
        const top = rowOffset;
        rowOffset += rowH;
        return (
          <div
            key={region}
            className="region-rail__label"
            style={{ top: COLUMN_HEADER_HEIGHT + top + rowH / 2 - 12 }}
          >
            {region}
          </div>
        );
      })}
    </div>
  );
}
