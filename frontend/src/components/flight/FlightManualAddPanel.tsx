import { useState } from 'react';
import { usePlanStore } from '../../stores/usePlanStore';
import type { FlightLegRole } from '../../types/travelIntel';
import {
  FormDateInput,
  FormField,
  FormInput,
  FormNumberInput,
  FormRow,
  FormSelect,
} from '../ui/FormField';
import './FlightManualAddPanel.css';

const ROLES: { id: FlightLegRole; label: string }[] = [
  { id: 'outbound', label: '去程' },
  { id: 'return', label: '回程' },
  { id: 'intercity', label: '城际' },
];

export interface FlightManualAddDefaults {
  origin?: string;
  destination?: string;
  departDate?: string;
  purchaseUrl?: string;
}

function combineDateTime(date: string, time: string): string {
  if (!date) return '';
  const t = time.trim() || '00:00';
  return `${date}T${t.length === 5 ? `${t}:00` : t}`;
}

export function FlightManualAddPanel({ defaults }: { defaults: FlightManualAddDefaults }) {
  const addManualFlightLeg = usePlanStore((s) => s.addManualFlightLeg);

  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<FlightLegRole>('outbound');
  const [origin, setOrigin] = useState(defaults.origin ?? '');
  const [destination, setDestination] = useState(defaults.destination ?? '');
  const [departDate, setDepartDate] = useState(defaults.departDate ?? '');
  const [departTime, setDepartTime] = useState('09:00');
  const [arriveDate, setArriveDate] = useState(defaults.departDate ?? '');
  const [arriveTime, setArriveTime] = useState('15:00');
  const [airline, setAirline] = useState('');
  const [flightNumbersRaw, setFlightNumbersRaw] = useState('');
  const [stops, setStops] = useState(0);
  const [purchaseUrl, setPurchaseUrl] = useState(defaults.purchaseUrl ?? '');
  const [bookedExternal, setBookedExternal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = origin.trim() && destination.trim() && departDate && arriveDate;

  function handleSubmit() {
    if (!canSubmit) return;
    const depart_at = combineDateTime(departDate, departTime);
    const arrive_at = combineDateTime(arriveDate, arriveTime);
    if (new Date(arrive_at).getTime() <= new Date(depart_at).getTime()) {
      setError('到达时间须晚于出发时间');
      return;
    }
    setError(null);
    const flight_numbers = flightNumbersRaw
      .split(/[,，/\\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    addManualFlightLeg({
      role,
      origin: origin.trim(),
      destination: destination.trim(),
      depart_at,
      arrive_at,
      airline: airline.trim() || undefined,
      flight_numbers: flight_numbers.length ? flight_numbers : undefined,
      stops,
      purchase_url: purchaseUrl.trim() || undefined,
      booked_external: bookedExternal,
    });
  }

  return (
    <div className="flight-manual">
      <button
        type="button"
        className="flight-manual__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flight-manual__toggle-label">手动添加航段</span>
        <span className="flight-manual__toggle-hint">
          {open ? '收起' : '已在 Trip.com / 航司订好？'}
        </span>
      </button>

      {open && (
        <div className="flight-manual__body">
          <p className="flight-manual__desc">
            填写实际起降时刻与航班号，作为行程锚点；与 Ignav 搜价互不影响。
          </p>
          <FormRow>
            <FormField label="航段">
              <FormSelect value={role} onChange={(e) => setRole(e.target.value as FlightLegRole)}>
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label=" ">
              <label className="flight-manual__check">
                <input
                  type="checkbox"
                  checked={bookedExternal}
                  onChange={(e) => setBookedExternal(e.target.checked)}
                />
                已在外部订好
              </label>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="出发">
              <FormInput
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="上海 / PVG"
              />
            </FormField>
            <FormField label="到达">
              <FormInput
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="新加坡 / SIN"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="出发日">
              <FormDateInput value={departDate} onChange={(e) => setDepartDate(e.target.value)} />
            </FormField>
            <FormField label="出发时刻">
              <FormInput
                type="time"
                value={departTime}
                onChange={(e) => setDepartTime(e.target.value)}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="到达日">
              <FormDateInput value={arriveDate} onChange={(e) => setArriveDate(e.target.value)} />
            </FormField>
            <FormField label="到达时刻">
              <FormInput
                type="time"
                value={arriveTime}
                onChange={(e) => setArriveTime(e.target.value)}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="航司">
              <FormInput
                value={airline}
                onChange={(e) => setAirline(e.target.value)}
                placeholder="春秋 / 新航"
              />
            </FormField>
            <FormField label="航班号">
              <FormInput
                value={flightNumbersRaw}
                onChange={(e) => setFlightNumbersRaw(e.target.value)}
                placeholder="9C8549，经停用逗号分隔"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="经停">
              <FormNumberInput
                min={0}
                max={4}
                value={stops}
                onChange={(e) => setStops(Number(e.target.value) || 0)}
              />
            </FormField>
            <FormField label="预订链接">
              <FormInput
                value={purchaseUrl}
                onChange={(e) => setPurchaseUrl(e.target.value)}
                placeholder="Trip.com 或航司确认页（可选）"
              />
            </FormField>
          </FormRow>
          {error && <p className="flight-manual__error">{error}</p>}
          <div className="flight-manual__actions">
            <button
              type="button"
              className="form-btn form-btn--primary form-btn--sm"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              添加航段
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
