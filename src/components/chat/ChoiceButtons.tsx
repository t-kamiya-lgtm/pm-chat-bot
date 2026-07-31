export interface ChoiceOption {
  label: string;
  value: string;
}

export function ChoiceButtons({
  options,
  onSelect,
}: {
  options: ChoiceOption[];
  onSelect: (option: ChoiceOption) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option)}
          className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-100"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
