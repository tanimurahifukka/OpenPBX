'use client';

interface Props {
  presets: Array<{ label: string; days: string[] }>;
}

export function DayPresets({ presets }: Props) {
  function applyPreset(days: string[]) {
    const form = (document.activeElement as HTMLElement)?.closest('form');
    if (!form) return;
    const checkboxes = form.querySelectorAll<HTMLInputElement>('input[name="day"]');
    const daySet = new Set(days);
    checkboxes.forEach((cb) => {
      cb.checked = daySet.has(cb.value);
    });
  }

  return (
    <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
      プリセット:
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => applyPreset(p.days)}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
        >
          {p.label}
        </button>
      ))}
    </span>
  );
}
