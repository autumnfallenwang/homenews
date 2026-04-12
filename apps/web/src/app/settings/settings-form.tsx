"use client";

import type { Setting } from "@homenews/shared";
import { Loader2, Plus, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resetAllSettings, updateSetting } from "@/lib/api";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { applyTheme } from "../theme-applier";
import type { FeedsSectionActions } from "./feeds-section";
import { FeedsSection } from "./feeds-section";

// --- Setting key groupings ---

const SCORING_KEYS = [
  "weight_relevance",
  "weight_importance",
  "weight_freshness",
  "weight_authority",
  "weight_uniqueness",
] as const;
const FRESHNESS_KEYS = ["freshness_lambda"] as const;
const SCHEDULER_KEYS = [
  "scheduler_enabled",
  "fetch_interval",
  "analyze_enabled",
  "analyze_batch_size",
  "summarize_enabled",
  "summarize_batch_size",
] as const;
const MODEL_KEYS = [
  "llm_model_analyze",
  "llm_model_analyze_fallback",
  "llm_model_summarize",
  "llm_model_summarize_fallback",
] as const;

type TabId = "scoring" | "freshness" | "scheduler" | "models" | "tags" | "theme" | "feeds";

const THEME_KEYS = ["theme"] as const;
const TAG_KEYS = ["allowed_tags"] as const;

interface TabDef {
  id: TabId;
  label: string;
  description: string;
  keys: readonly string[];
}

const TABS: TabDef[] = [
  {
    id: "scoring",
    label: "Scoring",
    description:
      "How each dimension contributes to the composite score. Weights roughly sum to 1.0.",
    keys: SCORING_KEYS,
  },
  {
    id: "freshness",
    label: "Freshness",
    description: "Decay rate for time-based ranking. Higher λ = faster falloff.",
    keys: FRESHNESS_KEYS,
  },
  {
    id: "scheduler",
    label: "Scheduler",
    description: "Control automatic pipeline runs and batch sizes.",
    keys: SCHEDULER_KEYS,
  },
  {
    id: "models",
    label: "LLM Models",
    description: "Which model each task uses. Changes take effect on the next LLM call.",
    keys: MODEL_KEYS,
  },
  {
    id: "tags",
    label: "Tag Vocabulary",
    description: "Allowed tags the analyze LLM can pick from. Edits stay pending until you save.",
    keys: TAG_KEYS,
  },
  {
    id: "theme",
    label: "Theme",
    description: "Switch between light, dark, or system (follows OS preference).",
    keys: THEME_KEYS,
  },
  {
    id: "feeds",
    label: "Feeds",
    description:
      "Add, remove, and configure RSS sources. Authority weight tunes per-feed influence on the composite score.",
    keys: [],
  },
];

const LABELS: Record<string, string> = {
  weight_relevance: "Relevance weight",
  weight_importance: "Importance weight",
  weight_freshness: "Freshness weight",
  weight_authority: "Source authority weight",
  weight_uniqueness: "Uniqueness weight",
  freshness_lambda: "Decay rate (λ)",
  scheduler_enabled: "Scheduler enabled",
  fetch_interval: "Fetch interval (cron)",
  analyze_enabled: "Analyze enabled",
  summarize_enabled: "Summarize enabled",
  analyze_batch_size: "Analyze batch size",
  summarize_batch_size: "Summarize batch size",
  llm_model_analyze: "Analyze model (primary)",
  llm_model_analyze_fallback: "Analyze model (fallback)",
  llm_model_summarize: "Summarize model (primary)",
  llm_model_summarize_fallback: "Summarize model (fallback)",
  theme: "Theme preference",
};

interface SettingsFormProps {
  initialSettings: Setting[];
  initialTab: string;
}

function indexValues(settings: Setting[]): Record<string, unknown> {
  return Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

function indexDescriptions(settings: Setting[]): Record<string, string> {
  return Object.fromEntries(settings.map((s) => [s.key, s.description ?? ""]));
}

function isValidTab(id: string): id is TabId {
  return TABS.some((t) => t.id === id);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return false;
}

export function SettingsForm({ initialSettings, initialTab }: SettingsFormProps) {
  const router = useRouter();
  const [savedValues, setSavedValues] = useState<Record<string, unknown>>(
    indexValues(initialSettings),
  );
  const [descriptions] = useState<Record<string, string>>(indexDescriptions(initialSettings));
  const [localValues, setLocalValues] = useState<Record<string, unknown>>({});
  const [activeTab, setActiveTab] = useState<TabId>(
    isValidTab(initialTab) ? initialTab : "scoring",
  );
  const [pendingTab, setPendingTab] = useState<TabId | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedsDirty, setFeedsDirty] = useState(false);
  const feedsActionsRef = useRef<FeedsSectionActions | null>(null);

  const handleFeedsDirtyChange = useCallback((d: boolean) => setFeedsDirty(d), []);

  function getValue<T>(key: string, fallback: T): T {
    const v = key in localValues ? localValues[key] : savedValues[key];
    return v === undefined || v === null ? fallback : (v as T);
  }

  function getDescription(key: string): string {
    return descriptions[key] ?? "";
  }

  function isDirty(key: string): boolean {
    return key in localValues && !valuesEqual(localValues[key], savedValues[key]);
  }

  function tabHasDirty(tabId: TabId): boolean {
    if (tabId === "feeds") return feedsDirty;
    const tab = TABS.find((t) => t.id === tabId);
    if (!tab) return false;
    return tab.keys.some(isDirty);
  }

  function setLocal(key: string, value: unknown) {
    setLocalValues((prev) => {
      if (valuesEqual(value, savedValues[key])) {
        const { [key]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: value };
    });
  }

  async function saveTab(tabId: TabId) {
    if (tabId === "feeds") {
      if (!feedsActionsRef.current) return;
      setBusy(true);
      try {
        await feedsActionsRef.current.save();
      } catch (err) {
        console.error("Save feeds failed:", err);
      } finally {
        setBusy(false);
      }
      return;
    }

    const tab = TABS.find((t) => t.id === tabId);
    if (!tab) return;
    const dirtyKeys = tab.keys.filter(isDirty);
    if (dirtyKeys.length === 0) return;

    setBusy(true);
    try {
      for (const key of dirtyKeys) {
        await updateSetting(key, localValues[key]);
        // Theme is also a runtime cookie + DOM event so the page updates immediately
        if (key === "theme") {
          applyTheme(localValues[key] as Theme);
        }
      }
      setSavedValues((prev) => {
        const next = { ...prev };
        for (const k of dirtyKeys) next[k] = localValues[k];
        return next;
      });
      setLocalValues((prev) => {
        const next = { ...prev };
        for (const k of dirtyKeys) delete next[k];
        return next;
      });
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setBusy(false);
    }
  }

  function cancelTab(tabId: TabId) {
    if (tabId === "feeds") {
      feedsActionsRef.current?.cancel();
      return;
    }
    const tab = TABS.find((t) => t.id === tabId);
    if (!tab) return;
    setLocalValues((prev) => {
      const next = { ...prev };
      for (const k of tab.keys) delete next[k];
      return next;
    });
  }

  function selectTab(tabId: TabId) {
    if (tabId === activeTab) return;
    if (tabHasDirty(activeTab)) {
      setPendingTab(tabId);
      return;
    }
    setActiveTab(tabId);
    router.replace(`/settings?tab=${tabId}`, { scroll: false });
  }

  function discardAndSwitch() {
    if (!pendingTab) return;
    cancelTab(activeTab);
    setActiveTab(pendingTab);
    router.replace(`/settings?tab=${pendingTab}`, { scroll: false });
    setPendingTab(null);
  }

  async function handleResetAll() {
    if (!window.confirm("Reset ALL settings to defaults? This cannot be undone.")) return;
    setResetting(true);
    try {
      await resetAllSettings();
      window.location.reload();
    } finally {
      setResetting(false);
    }
  }

  const dirtyTabIds = new Set(TABS.filter((t) => tabHasDirty(t.id)).map((t) => t.id));
  const activeTabDef = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div>
      {/* Page header */}
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Configuration
          </div>
          <h1 className="font-display text-[2.25rem] leading-[1.1] tracking-tight text-foreground">
            Settings
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
            Tune the composite scoring, scheduler, and LLM behavior. Changes are local until you
            save the active tab.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetAll}
          disabled={resetting}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-card/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" />
          Reset all
        </button>
      </header>

      {/* Tabbed layout */}
      <div className="grid grid-cols-[220px_1fr] gap-0 border border-border bg-card/20">
        <Sidebar tabs={TABS} activeTab={activeTab} dirtyTabs={dirtyTabIds} onSelect={selectTab} />

        <div className="relative min-h-[480px]">
          <ContentPane
            tab={activeTabDef}
            getValue={getValue}
            getDescription={getDescription}
            setLocal={setLocal}
            isDirty={isDirty}
            busy={busy}
            feedsActionsRef={feedsActionsRef}
            onFeedsDirtyChange={handleFeedsDirtyChange}
          />
          <SaveBar
            busy={busy}
            dirty={tabHasDirty(activeTab)}
            onCancel={() => cancelTab(activeTab)}
            onSave={() => saveTab(activeTab)}
          />
        </div>
      </div>

      <UnsavedDialog
        open={pendingTab !== null}
        onCancel={() => setPendingTab(null)}
        onDiscard={discardAndSwitch}
      />
    </div>
  );
}

// --- Sidebar ---

function Sidebar({
  tabs,
  activeTab,
  dirtyTabs,
  onSelect,
}: {
  tabs: TabDef[];
  activeTab: TabId;
  dirtyTabs: Set<TabId>;
  onSelect: (id: TabId) => void;
}) {
  return (
    <nav aria-label="Settings sections" className="border-r border-border bg-card/40 py-4">
      <div className="mb-3 px-4 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
        Sections
      </div>
      <ul className="space-y-px">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const isDirty = dirtyTabs.has(tab.id);
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                className={cn(
                  "group flex w-full items-center justify-between gap-2 border-l-2 px-4 py-2 text-left transition-colors",
                  isActive
                    ? "border-primary bg-card/80 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-card/40 hover:text-foreground",
                )}
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]">
                  {tab.label}
                </span>
                {isDirty && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-primary"
                    title="Unsaved changes"
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// --- Content pane router ---

interface PaneProps {
  tab: TabDef;
  getValue: <T>(key: string, fallback: T) => T;
  getDescription: (key: string) => string;
  setLocal: (key: string, value: unknown) => void;
  isDirty: (key: string) => boolean;
  busy: boolean;
  feedsActionsRef: React.MutableRefObject<FeedsSectionActions | null>;
  onFeedsDirtyChange: (dirty: boolean) => void;
}

function ContentPane(props: PaneProps) {
  const { tab } = props;
  return (
    <div className="px-8 py-7 pb-24">
      <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70">
        Section
      </div>
      <h2 className="font-display text-[1.5rem] leading-tight tracking-tight text-foreground">
        {tab.label}
      </h2>
      <p className="mt-1.5 mb-7 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
        {tab.description}
      </p>

      {tab.id === "scoring" && <ScoringSection {...props} />}
      {tab.id === "freshness" && <FreshnessSection {...props} />}
      {tab.id === "scheduler" && <SchedulerSection {...props} />}
      {tab.id === "models" && <ModelsSection {...props} />}
      {tab.id === "tags" && <TagsSection {...props} />}
      {tab.id === "theme" && <ThemeSection {...props} />}
      {tab.id === "feeds" && (
        <FeedsSection actionsRef={props.feedsActionsRef} onDirtyChange={props.onFeedsDirtyChange} />
      )}
    </div>
  );
}

// --- Sections ---

function ScoringSection(props: PaneProps) {
  return (
    <div className="space-y-5">
      {SCORING_KEYS.map((key) => (
        <NumberRow key={key} settingKey={key} {...props} min={0} max={1} step={0.05} />
      ))}
    </div>
  );
}

function FreshnessSection(props: PaneProps) {
  return (
    <div className="space-y-5">
      <NumberRow settingKey="freshness_lambda" {...props} min={0} max={1} step={0.01} />
    </div>
  );
}

function SchedulerSection(props: PaneProps) {
  return (
    <div className="space-y-5">
      <BooleanRow settingKey="scheduler_enabled" {...props} />
      <StringRow settingKey="fetch_interval" {...props} />
      <BooleanRow settingKey="analyze_enabled" {...props} />
      <NumberRow settingKey="analyze_batch_size" {...props} min={1} step={10} />
      <BooleanRow settingKey="summarize_enabled" {...props} />
      <NumberRow settingKey="summarize_batch_size" {...props} min={1} step={10} />
    </div>
  );
}

function ModelsSection(props: PaneProps) {
  return (
    <div className="space-y-5">
      {MODEL_KEYS.map((key) => (
        <StringRow key={key} settingKey={key} {...props} />
      ))}
    </div>
  );
}

function TagsSection(props: PaneProps) {
  const tags = props.getValue<string[]>("allowed_tags", []);
  return (
    <TagList
      tags={tags}
      onChange={(next) => props.setLocal("allowed_tags", next)}
      busy={props.busy}
    />
  );
}

function ThemeSection(props: PaneProps) {
  const value = props.getValue<Theme>("theme", "dark");
  const options: { value: Theme; label: string; hint: string }[] = [
    { value: "light", label: "Light", hint: "Always light" },
    { value: "dark", label: "Dark", hint: "Always dark" },
    { value: "system", label: "System", hint: "Follow OS" },
  ];
  return (
    <div className="space-y-5">
      <FieldShell settingKey="theme" getDescription={props.getDescription} isDirty={props.isDirty}>
        <div className="grid grid-cols-3 gap-2">
          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => props.setLocal("theme", opt.value)}
                className={cn(
                  "group flex flex-col items-start gap-1 rounded-sm border px-3 py-3 text-left transition-all",
                  active
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card/30 hover:border-border hover:bg-card/60",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-[11px] uppercase tracking-[0.14em]",
                    active ? "text-primary" : "text-foreground",
                  )}
                >
                  {opt.label}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </FieldShell>
    </div>
  );
}

// --- Reusable rows ---

interface RowProps {
  settingKey: string;
  getValue: <T>(key: string, fallback: T) => T;
  getDescription: (key: string) => string;
  setLocal: (key: string, value: unknown) => void;
  isDirty: (key: string) => boolean;
  busy: boolean;
}

function FieldShell({
  settingKey,
  getDescription,
  isDirty,
  children,
}: {
  settingKey: string;
  getDescription: (key: string) => string;
  isDirty: (key: string) => boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
      <div className="pt-1">
        <Label htmlFor={settingKey} className="flex items-center gap-2 text-[13px]">
          {LABELS[settingKey] ?? settingKey}
          {isDirty(settingKey) && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Modified" aria-hidden />
          )}
        </Label>
        {getDescription(settingKey) && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {getDescription(settingKey)}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function NumberRow(props: RowProps & { min?: number; max?: number; step?: number }) {
  const { settingKey, getValue, setLocal, min, max, step } = props;
  const value = getValue<number>(settingKey, 0);
  return (
    <FieldShell {...props}>
      <Input
        id={settingKey}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const num = Number.parseFloat(e.target.value);
          if (Number.isFinite(num)) setLocal(settingKey, num);
        }}
        className="h-9 font-mono text-[12px]"
      />
    </FieldShell>
  );
}

function BooleanRow(props: RowProps) {
  const { settingKey, getValue, setLocal } = props;
  const checked = getValue<boolean>(settingKey, false);
  return (
    <FieldShell {...props}>
      <div className="flex h-9 items-center">
        <Switch
          id={settingKey}
          checked={checked}
          onCheckedChange={(v: boolean) => setLocal(settingKey, v)}
        />
      </div>
    </FieldShell>
  );
}

function StringRow(props: RowProps) {
  const { settingKey, getValue, setLocal } = props;
  const value = getValue<string>(settingKey, "");
  return (
    <FieldShell {...props}>
      <Input
        id={settingKey}
        type="text"
        value={value}
        onChange={(e) => setLocal(settingKey, e.target.value)}
        className="h-9 font-mono text-[12px]"
      />
    </FieldShell>
  );
}

// --- Tag list (immediate save) ---

function TagList({
  tags,
  onChange,
  busy,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  busy: boolean;
}) {
  const [newTag, setNewTag] = useState("");

  function addTag() {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setNewTag("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <p className="text-[12px] text-muted-foreground">No tags configured.</p>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-card/40 py-0.5 pl-1.5 pr-1 font-mono text-[10px] lowercase tracking-wide text-muted-foreground"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={busy}
              className="rounded-sm p-0.5 text-muted-foreground/70 hover:bg-destructive/20 hover:text-destructive disabled:opacity-40"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Add a tag (e.g. ai-research)"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          disabled={busy}
          className="h-9 max-w-xs font-mono text-[12px]"
        />
        <Button onClick={addTag} disabled={busy || !newTag.trim()} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

// --- Save bar ---

function SaveBar({
  busy,
  dirty,
  onCancel,
  onSave,
}: {
  busy: boolean;
  dirty: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-border bg-card/80 px-8 py-3 backdrop-blur">
      <div
        className={cn(
          "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em]",
          dirty ? "text-primary" : "text-muted-foreground/70",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            dirty ? "bg-primary" : "bg-muted-foreground/40",
          )}
          aria-hidden
        />
        {dirty ? "Unsaved changes" : "All saved"}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy || !dirty}
          className="rounded-sm border border-border bg-card/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !dirty}
          className="inline-flex items-center gap-1.5 rounded-sm border border-primary/50 bg-primary/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-primary transition-all hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-40"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Save changes
        </button>
      </div>
    </div>
  );
}

// --- Unsaved changes dialog ---

function UnsavedDialog({
  open,
  onCancel,
  onDiscard,
}: {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-[18px]">Unsaved changes</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          You have unsaved changes in this section. Switching tabs will discard them.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-border bg-card/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-sm border border-destructive/50 bg-destructive/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-destructive transition-all hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            Discard &amp; switch
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
