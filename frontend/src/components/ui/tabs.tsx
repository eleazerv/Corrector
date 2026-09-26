"use client";

import { useRef, type KeyboardEvent } from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export const tabId = (group: string, id: string) => `${group}-tab-${id}`;
export const panelId = (group: string, id: string) => `${group}-panel-${id}`;

/** WAI-ARIA tabs: arrow keys move between tabs, Tab moves into the panel. */
export function Tabs({
  group,
  tabs,
  value,
  onChange,
  label,
}: {
  group: string;
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = tabs.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-border">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(group, t.id)}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={panelId(group, t.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`-mb-px flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 font-semibold ${
              active
                ? "border-primary bg-primary-soft text-primary"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="tabular font-normal">({t.count})</span>}
          </button>
        );
      })}
    </div>
  );
}
