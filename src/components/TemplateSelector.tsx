"use client";

import { useEffect, useState } from "react";

interface Template {
  name: string;
  type: string;
  content: string;
}

interface TemplateSelectorProps {
  onSelect: (content: string) => void;
}

/**
 * A dropdown that fetches page templates from the API and lets the user
 * pick one to pre-fill the content textarea. Renders nothing if no
 * templates are available (graceful degradation).
 */
export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wiki/templates")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.templates?.length) {
          setTemplates(data.templates);
        }
      })
      .catch(() => {
        // Graceful degradation — just don't show templates
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (templates.length === 0) return null;

  function handleChange(value: string) {
    setSelected(value);
    if (!value) {
      onSelect("");
      return;
    }
    const tpl = templates.find((t) => t.type === value);
    if (tpl) {
      onSelect(tpl.content);
    }
  }

  return (
    <div>
      <label
        htmlFor="template"
        className="block text-sm font-medium mb-1"
      >
        Start from template
      </label>
      <select
        id="template"
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full rounded-lg border border-foreground/10 bg-transparent px-4 py-2 text-sm outline-none focus:border-foreground/30 transition-colors"
      >
        <option value="">Blank</option>
        {templates.map((t) => (
          <option key={t.type} value={t.type}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
