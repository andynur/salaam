import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { LearningCourse, Page } from "../../shared/learning";
import { api, ApiError } from "../lib/api";
import { Icon, type IconName } from "../components/icons";
import { learningApi } from "../components/learning";
import type { NavItem } from "./navigation";

type Result = { href: string; label: string; meta: string; icon: IconName };

// Jump-to search: filters reachable pages locally and matches course names through the learning API.
export function GlobalSearch({ pages, canSearchCourses, onExpired }: { pages: NavItem[]; canSearchCourses: boolean; onExpired: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const [courses, setCourses] = useState<LearningCourse[] | null>([]);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const query = q.trim();

  useEffect(() => {
    if (!open || !canSearchCourses || !query) { setCourses([]); setFailed(false); return; }
    let live = true;
    setCourses(null); setFailed(false);
    const timer = setTimeout(() => {
      api<Page<LearningCourse>>(`${learningApi}?${new URLSearchParams({ q: query, offset: "0" })}`).then(page => { if (live) setCourses(page.items.slice(0, 5)); }).catch(cause => {
        if (!live) return;
        if (cause instanceof ApiError && cause.status === 401) onExpired();
        else { setFailed(true); setCourses([]); }
      });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [open, query, canSearchCourses, onExpired]);

  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault(); focusInput();
    }
    addEventListener("keydown", shortcut);
    return () => removeEventListener("keydown", shortcut);
  }, []);

  function focusInput() { setExpanded(true); requestAnimationFrame(() => input.current?.focus()); }
  function close() { setQ(""); setOpen(false); setExpanded(false); }
  const term = query.toLowerCase();
  const pageResults: Result[] = pages.filter(page => page.label.toLowerCase().includes(term)).map(page => ({ href: page.href, label: page.label, meta: "Halaman", icon: page.icon }));
  const courseResults: Result[] = (courses ?? []).map(course => ({ href: `/learning/courses/${course.id}`, label: course.name, meta: `${course.className} · ${course.term}`, icon: "book" }));
  const results = [...pageResults, ...courseResults];
  const current = Math.min(active, results.length - 1);
  function keydown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive(Math.min(current + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(Math.max(current - 1, 0)); }
    else if (event.key === "Enter" && open && results[current]) { event.preventDefault(); location.assign(results[current].href); }
    else if (event.key === "Escape") { event.preventDefault(); if (q) setQ(""); else { close(); input.current?.blur(); } }
  }
  const option = (result: Result, index: number) => <div key={result.href} id={`${id}-option-${index}`} role="option" aria-selected={index === current} className={`search-option${index === current ? " is-active" : ""}`} onMouseEnter={() => setActive(index)} onClick={() => location.assign(result.href)}>
    <span className="search-option-icon" aria-hidden="true"><Icon name={result.icon} /></span><span className="search-option-text"><strong>{result.label}</strong><small>{result.meta}</small></span>
  </div>;
  const message = failed ? "Course tidak dapat dimuat." : courses === null ? "Mencari course…" : !results.length ? `Tidak ada hasil untuk “${query}”.` : "";

  return <div className={`global-search${expanded ? " is-expanded" : ""}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); if (!query) setExpanded(false); } }}>
    <button type="button" className="icon-button search-trigger" aria-label="Cari" onClick={focusInput}><Icon name="search" size={20} /></button>
    <div className="search-field">
      <Icon name="search" className="search-field-icon" />
      <input ref={input} className="search-input" type="search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-listbox`} aria-activedescendant={open && results[current] ? `${id}-option-${current}` : undefined}
        aria-label={canSearchCourses ? "Cari halaman atau course" : "Cari halaman"} placeholder={canSearchCourses ? "Cari halaman atau course" : "Cari halaman"} maxLength={100} value={q}
        onFocus={() => setOpen(true)} onChange={event => { setQ(event.target.value); setActive(0); setOpen(true); }} onKeyDown={keydown} />
      <kbd className="search-hint" aria-hidden="true">/</kbd>
      <button type="button" className="icon-button search-close" aria-label="Tutup pencarian" onClick={close}><Icon name="close" /></button>
    </div>
    {open && <div className="search-popover" onMouseDown={event => event.preventDefault()}>
      <div id={`${id}-listbox`} role="listbox" aria-label="Hasil pencarian">
        {pageResults.length > 0 && <div role="group" aria-labelledby={`${id}-pages`}><div className="search-group-label" id={`${id}-pages`}>Halaman</div>{pageResults.map(option)}</div>}
        {courseResults.length > 0 && <div role="group" aria-labelledby={`${id}-courses`}><div className="search-group-label" id={`${id}-courses`}>Course</div>{courseResults.map((result, index) => option(result, pageResults.length + index))}</div>}
      </div>
      {message && <p className="search-message" role="status">{message}</p>}
    </div>}
  </div>;
}
