import type { DayWeather } from '../../types/itinerary';
import { WEATHER_ICON_OPTIONS } from '../../data/categoryTokens';
import { weatherIconLabel } from '../../utils/formatWeather';
import { FormField, FormInput, FormRow, FormSection, FormSelect } from '../ui/FormField';

interface DayWeatherEditorProps {
  weather?: DayWeather;
  onChange: (partial: Partial<DayWeather>) => void;
}

export function DayWeatherEditor({ weather, onChange }: DayWeatherEditorProps) {
  return (
    <FormSection title="当日天气">
      <FormRow>
        <FormField label="最低温 °C">
          <FormInput
            type="number"
            value={weather?.temp_min ?? ''}
            onChange={(e) =>
              onChange({ temp_min: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </FormField>
        <FormField label="最高温 °C">
          <FormInput
            type="number"
            value={weather?.temp_max ?? ''}
            onChange={(e) =>
              onChange({ temp_max: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </FormField>
      </FormRow>
      <FormField label="天气">
        <FormSelect
          value={weather?.icon ?? 'cloudy'}
          onChange={(e) => {
            const icon = e.target.value as DayWeather['icon'];
            onChange({ icon, description: weatherIconLabel(icon) });
          }}
        >
          {WEATHER_ICON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </FormSelect>
      </FormField>
    </FormSection>
  );
}
