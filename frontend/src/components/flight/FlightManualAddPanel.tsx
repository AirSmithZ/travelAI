import { useState } from 'react';
import { validateManualFlight } from '../../api/flights';
import { usePlanStore } from '../../stores/usePlanStore';
import type { FlightLegRole } from '../../types/travelIntel';
import { parseTripcomSearchUrl } from '../../utils/parseTripcomSearchUrl';
import {
  FormDateInput,
  FormField,
  FormInput,
  FormNumberInput,
  FormRow,
  FormSelect,
} from '../ui/FormField';
import { AirportCombobox } from './AirportCombobox';
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
  const trip = usePlanStore((s) => s.getActivePlan().trip_request);

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
  const [warn, setWarn] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const canSubmit = origin.trim() && destination.trim() && departDate && arriveDate;

  function handleParseTripUrl() {
    const parsed = parseTripcomSearchUrl(purchaseUrl);
    if (!parsed) {
      setError('无法从链接解析（需含 dcity/acity/ddate 的 Trip.com 搜索 URL）');
      return;
    }
    setOrigin(parsed.origin);
    setDestination(parsed.destination);
    setDepartDate(parsed.departDate);
    setArriveDate(parsed.departDate);
    setError(null);
    setWarn(
      parsed.returnDate
        ? `已预填往返搜索（返程 ${parsed.returnDate}）；航班号仍需手填`
        : '已从 Trip 链接预填起终点与日期；航班号仍需手填',
    );
  }

  async function handleSubmit() {
    if (!canSubmit || validating) return;
    const depart_at = combineDateTime(departDate, departTime);
    const arrive_at = combineDateTime(arriveDate, arriveTime);
    if (new Date(arrive_at).getTime() <= new Date(depart_at).getTime()) {
      setError('到达时间须晚于出发时间');
      return;
    }

    setValidating(true);
    setError(null);
    setWarn(null);
    try {
      const v = await validateManualFlight({
        origin: origin.trim(),
        destination: destination.trim(),
        depart_at,
        arrive_at,
        trip_destination: trip.destination,
        trip_date_start: trip.date_start,
        trip_date_end: trip.date_end,
      });
      if (!v.ok) {
        setError(v.errors[0] ?? '校验未通过');
        return;
      }
      if (v.warnings.length) setWarn(v.warnings[0] ?? null);

      const flight_numbers = flightNumbersRaw
        .split(/[,，/\\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      addManualFlightLeg({
        role,
        origin: v.origin_iata || origin.trim(),
        destination: v.dest_iata || destination.trim(),
        depart_at,
        arrive_at,
        airline: airline.trim() || undefined,
        flight_numbers: flight_numbers.length ? flight_numbers : undefined,
        stops,
        purchase_url: purchaseUrl.trim() || undefined,
        booked_external: bookedExternal,
      });
    } catch (e) {
      // Offline: allow local add with client-side time check only
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
      setWarn(
        e instanceof Error
          ? `服务端校验不可用，已本地添加（${e.message}）`
          : '服务端校验不可用，已本地添加',
      );
    } finally {
      setValidating(false);
    }
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
            填写实际起降时刻与航班号，作为行程锚点；可粘贴 Trip 搜索链接预填 OD/日期。
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
              <AirportCombobox
                value={origin}
                onChange={setOrigin}
                placeholder="城市 / 国家 / IATA"
              />
            </FormField>
            <FormField label="到达">
              <AirportCombobox
                value={destination}
                onChange={setDestination}
                placeholder="如 马来西亚 / 吉隆坡 / KUL"
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="出发日">
              <FormDateInput
                value={departDate}
                onChange={(next) => {
                  setDepartDate(next);
                  if (!arriveDate || arriveDate < next) setArriveDate(next);
                }}
                placeholder="出发日期"
              />
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
              <FormDateInput
                value={arriveDate}
                min={departDate || undefined}
                onChange={setArriveDate}
                placeholder="到达日期"
              />
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
                placeholder="Trip.com showfarefirst 链接（可选）"
              />
            </FormField>
          </FormRow>
          <div className="flight-manual__actions">
            <button
              type="button"
              className="form-btn form-btn--sm"
              disabled={!purchaseUrl.trim()}
              onClick={handleParseTripUrl}
            >
              从 Trip 链接预填
            </button>
            <button
              type="button"
              className="form-btn form-btn--primary form-btn--sm"
              disabled={!canSubmit || validating}
              onClick={() => void handleSubmit()}
            >
              {validating ? '校验中…' : '添加航段'}
            </button>
          </div>
          {error && <p className="flight-manual__error">{error}</p>}
          {warn && <p className="flight-manual__warn">{warn}</p>}
        </div>
      )}
    </div>
  );
}
