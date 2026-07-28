import { useEffect, useRef, useState } from 'react';

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function MultiSelectFilter({ label, options, selected, onChange }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  function toggle(option: string) {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(next);
  }

  return (
    <div className="filter-group" ref={rootRef}>
      <button type="button" className="filter-btn" onClick={() => setOpen((v) => !v)}>
        {label} <span className="filter-count">{selected.size ? `${selected.size} sel.` : 'todas'}</span> ▾
      </button>
      {open ? (
        <div className="filter-panel open">
          <div className="actions">
            <span onClick={() => onChange(new Set(options))}>Selecionar todas</span>
            <span onClick={() => onChange(new Set())}>Limpar</span>
          </div>
          {options.map((option) => (
            <label key={option}>
              <input type="checkbox" checked={selected.has(option)} onChange={() => toggle(option)} />
              {option}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
