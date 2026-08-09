import {
  candidateKey,
  isSameCandidate,
  type ZoneHotelCandidate,
} from './zoneHotelShared';

export function HotelCandidateList({
  items,
  selected,
  showAddress,
  ariaLabel,
  onSelect,
}: {
  items: ZoneHotelCandidate[];
  selected: ZoneHotelCandidate | null;
  showAddress?: boolean;
  ariaLabel: string;
  onSelect: (c: ZoneHotelCandidate) => void;
}) {
  return (
    <ul className="stay-zone__lodging-list" aria-label={ariaLabel}>
      {items.map((c) => {
        const active = isSameCandidate(selected, c);
        return (
          <li key={candidateKey(c)}>
            <button
              type="button"
              className={`stay-zone__lodging-item${
                active ? ' stay-zone__lodging-item--selected' : ''
              }`}
              onClick={() => onSelect(c)}
            >
              <span className="stay-zone__lodging-main">
                <span>{c.name}</span>
                {showAddress && c.address ? (
                  <span className="stay-zone__lodging-addr">{c.address}</span>
                ) : null}
              </span>
              <span className="stay-zone__lodging-meta">
                {c.distance_m != null ? `${c.distance_m}m` : ''}
                {c.rating != null ? ` · ★${c.rating}` : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
