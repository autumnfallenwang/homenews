"use client";

import { DEFAULT_SETTINGS, type Setting } from "@homenews/shared";
import { Plus, RotateCcw, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateSetting } from "@/lib/api";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { applyTheme } from "../theme-applier";
import { FeedsSection } from "./feeds-section";

// --- Setting key groupings ---

const SCORING_KEYS = [
  "weight_relevance",
  "weight_importance",
  "weight_freshness",
  "freshness_lambda",
  "weight_authority",
  "weight_uniqueness",
] as const;
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
  "embedding_model_name",
  "embedding_model_name_fallback",
] as const;

type TabId = "scoring" | "scheduler" | "models" | "theme" | "feeds";

const THEME_KEYS = ["theme"] as const;

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
      "How each dimension contributes to the composite score. Weights roughly sum to 1.0; freshness λ controls how fast older articles decay.",
    keys: SCORING_KEYS,
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
    description:
      "Which model each task uses, plus the tag vocabulary the analyze LLM picks from. Changes take effect on the next LLM call.",
    keys: MODEL_KEYS,
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
  embedding_model_name: "Embedding model (primary)",
  embedding_model_name_fallback: "Embedding model (fallback)",
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

export function SettingsForm({ initialSettings, initialTab }: SettingsFormProps) {
  const searchParams = useSearchParams();
  // Single source of truth — there's no "draft" tier anymore. Edits commit
  // immediately to the server; on success the optimistic value stays, on
  // failure we revert. Text inputs hold their own local typing buffer inside
  // each Row and only call commit() on blur or Enter.
  const [values, setValues] = useState<Record<string, unknown>>(indexValues(initialSettings));
  const [descriptions] = useState<Record<string, string>>(indexDescriptions(initialSettings));
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 18 Task 125: activeTab is read from the URL each render. The tab
  // nav lives in the AppSidebar's Shape B contextual zone now (parallel
  // route at @sidebar/settings/page.tsx); clicking a tab navigates via
  // <Link>, which updates ?tab=, which feeds back here.
  const tabFromUrl = searchParams.get("tab");
  let activeTab: TabId = "scoring";
  if (isValidTab(tabFromUrl ?? "")) activeTab = tabFromUrl as TabId;
  else if (isValidTab(initialTab)) activeTab = initialTab;

  function getValue<T>(key: string, fallback: T): T {
    const v = values[key];
    return v === undefined || v === null ? fallback : (v as T);
  }

  function getDescription(key: string): string {
    return descriptions[key] ?? "";
  }

  // Commit a single setting. Optimistic local update, POST in background,
  // revert on failure. Theme is special — it also flips the runtime cookie
  // + DOM class so the page repaints immediately.
  async function commit(key: string, value: unknown) {
    const prev = values[key];
    if (Object.is(prev, value)) return;
    setValues((s) => ({ ...s, [key]: value }));
    if (key === "theme") applyTheme(value as Theme);
    try {
      await updateSetting(key, value);
      setError(null);
      setSavedFlash(true);
    } catch (err) {
      console.error(`Save ${key} failed:`, err);
      setValues((s) => ({ ...s, [key]: prev }));
      if (key === "theme") applyTheme(prev as Theme);
      setError(`Failed to save ${LABELS[key] ?? key}`);
    }
  }

  // Brief "Saved" pulse for the page-header status after a commit.
  useEffect(() => {
    if (!savedFlash) return;
    const t = window.setTimeout(() => setSavedFlash(false), 1400);
    return () => window.clearTimeout(t);
  }, [savedFlash]);

  const activeTabDef = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  let headerStatus: React.ReactNode = (
    <span className="text-muted-foreground/70">Auto-save on change</span>
  );
  if (error) {
    headerStatus = <span className="text-destructive">{error}</span>;
  } else if (savedFlash) {
    headerStatus = <span className="text-primary">Saved</span>;
  }

  return (
    <>
      <PageHeader title={`Settings · ${activeTabDef.label}`} status={headerStatus} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <ContentPane
          tab={activeTabDef}
          getValue={getValue}
          getDescription={getDescription}
          commit={commit}
        />
      </main>
    </>
  );
}

// --- Content pane router ---

interface PaneProps {
  tab: TabDef;
  getValue: <T>(key: string, fallback: T) => T;
  getDescription: (key: string) => string;
  commit: (key: string, value: unknown) => void;
}

function ContentPane(props: PaneProps) {
  const { tab } = props;
  return (
    <div className="px-8 py-7">
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
      {tab.id === "scheduler" && <SchedulerSection {...props} />}
      {tab.id === "models" && <ModelsSection {...props} />}
      {tab.id === "theme" && <ThemeSection {...props} />}
      {tab.id === "feeds" && <FeedsSection />}
    </div>
  );
}

// --- Sections ---

function ScoringSection(props: PaneProps) {
  return (
    <div className="space-y-5">
      {SCORING_KEYS.map((key) => {
        // freshness_lambda needs a finer step than the weights (decay rate
        // lives around 0.03, not in 0.05 increments).
        const step = key === "freshness_lambda" ? 0.01 : 0.05;
        return (
          <NumberRow
            key={key}
            settingKey={key}
            {...props}
            min={0}
            max={1}
            step={step}
            showDefault
          />
        );
      })}
      <ResetSectionButton
        keys={SCORING_KEYS}
        commit={props.commit}
        label="Reset scoring to defaults"
      />
    </div>
  );
}

// Per-section reset — inline two-step confirm. Click once to arm, then
// either Confirm to commit defaults for every key in `keys`, or Cancel to
// disarm. Lives at the bottom of each section's table so the action is
// scoped, not global.
function ResetSectionButton({
  keys,
  commit,
  label,
}: {
  keys: readonly string[];
  commit: (key: string, value: unknown) => void;
  label: string;
}) {
  const [armed, setArmed] = useState(false);

  function doReset() {
    for (const k of keys) {
      const def = DEFAULT_SETTINGS[k]?.value;
      if (def !== undefined) commit(k, def);
    }
    setArmed(false);
  }

  return (
    <div className="mt-6 flex items-center justify-between gap-3 rounded-sm border border-border bg-card/30 px-4 py-3">
      {armed ? (
        <>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Reset to defaults?
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={doReset}
              className="inline-flex items-center gap-1.5 rounded-sm border border-destructive/50 bg-destructive/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-destructive transition-colors hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
            Restore section defaults
          </span>
          <button
            type="button"
            onClick={() => setArmed(true)}
            className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {label}
          </button>
        </>
      )}
    </div>
  );
}

function SchedulerSection(props: PaneProps) {
  return (
    <div className="space-y-5">
      <BooleanRow settingKey="scheduler_enabled" {...props} />
      <FetchIntervalRow {...props} />
      <BooleanRow settingKey="analyze_enabled" {...props} />
      <NumberRow settingKey="analyze_batch_size" {...props} min={1} step={10} showDefault />
      <BooleanRow settingKey="summarize_enabled" {...props} />
      <NumberRow settingKey="summarize_batch_size" {...props} min={1} step={10} showDefault />
      <ResetSectionButton
        keys={SCHEDULER_KEYS}
        commit={props.commit}
        label="Reset scheduler to defaults"
      />
    </div>
  );
}

// --- Fetch interval (simple / cron toggle) ---

type IntervalUnit = "minutes" | "hours";

interface ParsedInterval {
  unit: IntervalUnit;
  every: number;
}

/** Parse a cron string into a simple every-N-minutes/hours shape. Returns
 *  null when the expression can't be expressed that simply (user must use
 *  advanced mode). */
function parseCronToSimple(cron: string): ParsedInterval | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dom, month, dow] = parts;
  if (dom !== "*" || month !== "*" || dow !== "*") return null;

  // every N minutes: */N * * * *
  const minMatch = minute.match(/^\*\/(\d+)$/);
  if (minMatch && hour === "*") {
    const n = Number.parseInt(minMatch[1], 10);
    if (n >= 1 && n <= 59) return { unit: "minutes", every: n };
  }
  // every N hours at minute 0: 0 */N * * *
  const hourMatch = hour.match(/^\*\/(\d+)$/);
  if (hourMatch && minute === "0") {
    const n = Number.parseInt(hourMatch[1], 10);
    if (n >= 1 && n <= 23) return { unit: "hours", every: n };
  }
  // hourly: 0 * * * *
  if (minute === "0" && hour === "*") {
    return { unit: "hours", every: 1 };
  }
  return null;
}

function simpleToCron({ unit, every }: ParsedInterval): string {
  if (unit === "minutes") {
    return `*/${every} * * * *`;
  }
  if (every === 1) return "0 * * * *";
  return `0 */${every} * * *`;
}

function FetchIntervalRow(props: PaneProps & { showDefault?: boolean }) {
  const { getValue, commit, getDescription, showDefault } = props;
  const settingKey = "fetch_interval";
  const current = getValue<string>(settingKey, "*/30 * * * *");
  const parsed = parseCronToSimple(current);

  // Mode is purely local UI state. If the stored cron can't be parsed as a
  // simple expression, force advanced mode.
  const [mode, setMode] = useState<"simple" | "cron">(parsed ? "simple" : "cron");
  // If the saved value becomes unparseable (e.g. user typed a custom cron
  // then re-opened), snap the toggle to advanced.
  if (mode === "simple" && !parsed) {
    // Don't call setMode during render; defer via a flag.
    queueMicrotask(() => setMode("cron"));
  }

  const simple: ParsedInterval = parsed ?? { unit: "minutes", every: 30 };

  function updateSimple(next: Partial<ParsedInterval>) {
    const merged: ParsedInterval = { ...simple, ...next };
    // Clamp
    if (merged.unit === "minutes") {
      merged.every = Math.max(1, Math.min(59, merged.every));
    } else {
      merged.every = Math.max(1, Math.min(23, merged.every));
    }
    commit(settingKey, simpleToCron(merged));
  }

  return (
    <FieldShell settingKey={settingKey} getDescription={getDescription} showDefault={showDefault}>
      <div className="space-y-2">
        <ModeToggle value={mode} onChange={setMode} />
        {mode === "simple" ? (
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Every
            </span>
            <Input
              type="number"
              min={1}
              max={simple.unit === "minutes" ? 59 : 23}
              step={1}
              defaultValue={simple.every}
              key={`every-${simple.unit}-${simple.every}`}
              onBlur={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(n)) updateSimple({ every: n });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="h-9 w-20 font-mono text-[12px]"
            />
            <select
              value={simple.unit}
              onChange={(e) => updateSimple({ unit: e.target.value as IntervalUnit })}
              className="h-9 rounded-sm border border-border bg-card/30 px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="minutes" className="bg-background text-foreground">
                Minutes
              </option>
              <option value="hours" className="bg-background text-foreground">
                Hours
              </option>
            </select>
          </div>
        ) : (
          <CommitOnBlurInput
            id={settingKey}
            type="text"
            value={current}
            placeholder="*/30 * * * *"
            className="h-9 font-mono text-[12px]"
            onCommit={(v) => commit(settingKey, v)}
          />
        )}
        <p className="font-mono text-[10px] text-muted-foreground/70">
          Resolved cron: <span className="text-muted-foreground">{current}</span>
        </p>
      </div>
    </FieldShell>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: "simple" | "cron";
  onChange: (v: "simple" | "cron") => void;
}) {
  const options: { id: "simple" | "cron"; label: string }[] = [
    { id: "simple", label: "Simple" },
    { id: "cron", label: "Cron" },
  ];
  return (
    <div className="inline-flex rounded-sm border border-border bg-card/30 p-0.5">
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={cn(
              "rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
              active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// Model picks per task — sourced from llmgw `/v1/models` filtered to
// status=ok + capability=chat. Sticking to Anthropic + Ollama families per
// CLAUDE.md note ("other gateway families have been unreliable"). Each list
// leads with the seeded default. The currently-saved value is force-appended
// to the dropdown when missing, so existing custom values are never silently
// dropped (see SelectRow).
const MODEL_OPTIONS: Record<(typeof MODEL_KEYS)[number], readonly string[]> = {
  llm_model_analyze: ["claude-haiku-4-5", "claude-sonnet-4-5", "gpt-oss:20b"],
  llm_model_analyze_fallback: ["gemma4:26b", "qwen3:30b", "gpt-oss:20b"],
  llm_model_summarize: ["claude-sonnet-4-5", "claude-opus-4-5", "claude-haiku-4-5"],
  llm_model_summarize_fallback: ["gemma4:26b", "qwen3:30b", "gpt-oss:20b"],
  // Embedding models must produce 1024-dim vectors to match the schema's
  // vector(1024) column. Other llmgw embedding models (e.g.
  // nomic-embed-text @ 768) are valid in the gateway but would break the
  // column constraint and require a backfill + migration. The fallback is
  // also constrained to 1024-dim — when primary fails, embed.ts retries
  // with this model and the vector must fit the same column.
  embedding_model_name: ["bge-m3:latest", "qwen3-embedding:0.6b"],
  embedding_model_name_fallback: ["qwen3-embedding:0.6b", "bge-m3:latest"],
};

function ModelsSection(props: PaneProps) {
  return (
    <div className="space-y-5">
      {MODEL_KEYS.map((key) => (
        <SelectRow key={key} settingKey={key} {...props} options={MODEL_OPTIONS[key]} />
      ))}
      <ResetSectionButton
        keys={MODEL_KEYS}
        commit={props.commit}
        label="Reset models to defaults"
      />

      {/* Tag vocabulary — merged from the old Tags tab (Phase 18). Lives
          with the models because it's an input the analyze LLM consumes:
          edits to the vocabulary travel through the same model on the next
          analyze tick. */}
      <div className="pt-6 mt-4 border-t border-border">
        <h3 className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
          Section
        </h3>
        <h2 className="font-display text-[1.25rem] leading-tight tracking-tight text-foreground">
          Tag vocabulary
        </h2>
        <p className="mt-1 mb-5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
          Allowed tags the analyze LLM may pick from for each article.
        </p>
        <TagsSection {...props} />
      </div>
    </div>
  );
}

function SelectRow(props: RowProps & { options: readonly string[]; showDefault?: boolean }) {
  const { settingKey, getValue, commit, getDescription, options, showDefault } = props;
  const value = getValue<string>(settingKey, "");
  // Preserve any saved value that isn't in the curated list so users with
  // older / hand-picked models don't lose it when they open the dropdown.
  const fullOptions = options.includes(value) ? options : [...options, value];
  return (
    <FieldShell settingKey={settingKey} getDescription={getDescription} showDefault={showDefault}>
      <select
        id={settingKey}
        value={value}
        onChange={(e) => commit(settingKey, e.target.value)}
        className="h-9 w-full rounded-sm border border-border bg-card/30 px-2 font-mono text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {fullOptions.map((opt) => (
          <option key={opt} value={opt} className="bg-background text-foreground">
            {opt}
            {options.includes(opt) ? "" : " (custom)"}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function TagsSection(props: PaneProps) {
  const tags = props.getValue<string[]>("allowed_tags", []);
  return <TagList tags={tags} onChange={(next) => props.commit("allowed_tags", next)} />;
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
      <FieldShell settingKey="theme" getDescription={props.getDescription}>
        <div className="grid grid-cols-3 gap-2">
          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => props.commit("theme", opt.value)}
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
  commit: (key: string, value: unknown) => void;
}

function FieldShell({
  settingKey,
  getDescription,
  showDefault,
  children,
}: {
  settingKey: string;
  getDescription: (key: string) => string;
  showDefault?: boolean;
  children: React.ReactNode;
}) {
  const defaultValue = showDefault ? DEFAULT_SETTINGS[settingKey]?.value : undefined;
  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
      <div className="pt-1">
        <Label htmlFor={settingKey} className="flex items-center gap-2 text-[13px]">
          {LABELS[settingKey] ?? settingKey}
        </Label>
        {getDescription(settingKey) && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {getDescription(settingKey)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        {defaultValue !== undefined && (
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground/60">
            default <span className="text-muted-foreground/80">{String(defaultValue)}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// Commit-on-blur input — buffers keystrokes locally so we don't fire a
// network request per character, then commits on blur or Enter. Escape
// reverts to the externally-passed value.
function CommitOnBlurInput({
  value,
  onCommit,
  parse,
  ...rest
}: Omit<React.ComponentProps<"input">, "onChange" | "value"> & {
  value: string;
  onCommit: (value: string) => void;
  parse?: (raw: string) => string | null;
}) {
  const [draft, setDraft] = useState(value);
  // External value changes (server response after commit, or tab switch)
  // overwrite the local buffer unless the user is mid-edit. We use a key
  // remount strategy by tracking the upstream value as a sentinel.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function flush() {
    if (draft === value) return;
    if (parse) {
      const parsed = parse(draft);
      if (parsed === null) {
        setDraft(value);
        return;
      }
      onCommit(parsed);
    } else {
      onCommit(draft);
    }
  }

  return (
    <Input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={flush}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function NumberRow(
  props: RowProps & { min?: number; max?: number; step?: number; showDefault?: boolean },
) {
  const { settingKey, getValue, commit, getDescription, min, max, step, showDefault } = props;
  const value = getValue<number>(settingKey, 0);
  return (
    <FieldShell settingKey={settingKey} getDescription={getDescription} showDefault={showDefault}>
      <CommitOnBlurInput
        id={settingKey}
        type="number"
        value={String(value)}
        min={min}
        max={max}
        step={step}
        className="h-9 w-28 font-mono text-[12px]"
        onCommit={(raw) => {
          const num = Number.parseFloat(raw);
          if (Number.isFinite(num)) commit(settingKey, num);
        }}
      />
    </FieldShell>
  );
}

function BooleanRow(props: RowProps & { showDefault?: boolean }) {
  const { settingKey, getValue, commit, getDescription, showDefault } = props;
  const checked = getValue<boolean>(settingKey, false);
  return (
    <FieldShell settingKey={settingKey} getDescription={getDescription} showDefault={showDefault}>
      <div className="flex h-9 items-center">
        <Switch
          id={settingKey}
          checked={checked}
          onCheckedChange={(v: boolean) => commit(settingKey, v)}
        />
      </div>
    </FieldShell>
  );
}

// --- Tag list (immediate save) ---

function TagList({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
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
              className="rounded-sm p-0.5 text-muted-foreground/70 hover:bg-destructive/20 hover:text-destructive"
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
          className="h-9 max-w-xs font-mono text-[12px]"
        />
        <Button onClick={addTag} disabled={!newTag.trim()} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}
