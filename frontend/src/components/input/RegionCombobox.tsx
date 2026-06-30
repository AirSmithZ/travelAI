import { FormField, FormInput } from '../ui/FormField';

interface RegionComboboxProps {
  value: string | undefined;
  options: string[];
  inheritLabel: string;
  inputId: string;
  onChange: (region: string | undefined) => void;
}

export function RegionCombobox({
  value,
  options,
  inheritLabel,
  inputId,
  onChange,
}: RegionComboboxProps) {
  const display = value ?? '';

  return (
    <FormField label="区域">
      <FormInput
        id={inputId}
        value={display}
        placeholder={inheritLabel}
        list={`${inputId}-regions`}
        autoComplete="off"
        onChange={(e) => {
          const next = e.target.value.trim();
          onChange(next || undefined);
        }}
      />
      <datalist id={`${inputId}-regions`}>
        {options.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <p className="itinerary-editor__field-hint">
        留空则继承：{inheritLabel}；可输入列表外新区域名
      </p>
    </FormField>
  );
}
