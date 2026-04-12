"use client";

import type { Setting } from "@homenews/shared";
import { Loader2, Play, Plus, RefreshCw, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  type AnalyzePipelineResult,
  type FetchPipelineResult,
  resetAllSettings,
  type SummarizePipelineResult,
  triggerPipelineAnalyze,
  triggerPipelineFetch,
  triggerPipelineRunAll,
  triggerPipelineSummarize,
  updateSetting,
} from "@/lib/api";

// Human-readable labels for settings keys
const LABELS: Record<string, string> = {
  weight_relevance: "Relevance weight",
  weight_importance: "Importance weight",
  weight_freshness: "Freshness weight",
  weight_authority: "Source authority weight",
  weight_uniqueness: "Uniqueness weight",
  freshness_lambda: "Freshness decay rate (λ)",
  min_score_default: "Default minimum score",
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
  allowed_tags: "Tag vocabulary",
};

function indexByKey(settings: Setting[]): Record<string, Setting> {
  return Object.fromEntries(settings.map((s) => [s.key, s]));
}

export function SettingsForm({ initialSettings }: { initialSettings: Setting[] }) {
  const [settings, setSettings] = useState(indexByKey(initialSettings));
  const [busy, setBusy] = useState<string | null>(null);
  const [pipelineStats, setPipelineStats] = useState<{
    fetch?: FetchPipelineResult;
    analyze?: AnalyzePipelineResult;
    summarize?: SummarizePipelineResult;
    lastRunAt?: string;
    error?: string;
  }>({});

  function getValue<T>(key: string, fallback: T): T {
    const raw = settings[key]?.value;
    return raw === undefined || raw === null ? fallback : (raw as T);
  }

  function getDescription(key: string): string {
    return settings[key]?.description ?? "";
  }

  async function save(key: string, value: unknown) {
    setBusy(key);
    try {
      const updated = await updateSetting(key, value);
      setSettings((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? {
            id: "",
            userId: null,
            key,
            valueType: updated.valueType,
            description: updated.description,
            updatedAt: new Date().toISOString(),
          }),
          value: updated.value,
          description: updated.description ?? prev[key]?.description ?? null,
        } as Setting,
      }));
    } catch (err) {
      console.error(`Failed to save ${key}:`, err);
    } finally {
      setBusy(null);
    }
  }

  async function handleResetAll() {
    if (!window.confirm("Reset ALL settings to defaults? This cannot be undone.")) return;
    setBusy("reset");
    try {
      await resetAllSettings();
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  async function runFetch() {
    setBusy("pipeline-fetch");
    setPipelineStats({ lastRunAt: new Date().toISOString() });
    try {
      const r = await triggerPipelineFetch();
      setPipelineStats({ fetch: r, lastRunAt: new Date().toISOString() });
    } catch (err) {
      setPipelineStats({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function runAnalyze() {
    setBusy("pipeline-analyze");
    try {
      const r = await triggerPipelineAnalyze();
      setPipelineStats({ analyze: r, lastRunAt: new Date().toISOString() });
    } catch (err) {
      setPipelineStats({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function runSummarize() {
    setBusy("pipeline-summarize");
    try {
      const r = await triggerPipelineSummarize();
      setPipelineStats({ summarize: r, lastRunAt: new Date().toISOString() });
    } catch (err) {
      setPipelineStats({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function runAll() {
    setBusy("pipeline-run-all");
    try {
      const r = await triggerPipelineRunAll();
      setPipelineStats({
        fetch: r.fetch,
        analyze: r.analyze,
        summarize: r.summarize,
        lastRunAt: new Date().toISOString(),
      });
    } catch (err) {
      setPipelineStats({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Tune scoring weights, the tag vocabulary, and pipeline behavior. Changes apply
            immediately — no restart needed.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleResetAll} disabled={busy === "reset"}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to defaults
        </Button>
      </div>

      {/* Scoring weights */}
      <Section
        title="Scoring weights"
        description="How each dimension contributes to the composite score. Weights roughly sum to 1.0."
      >
        <NumberRow
          settingKey="weight_relevance"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
          min={0}
          max={1}
          step={0.05}
        />
        <NumberRow
          settingKey="weight_importance"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
          min={0}
          max={1}
          step={0.05}
        />
        <NumberRow
          settingKey="weight_freshness"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
          min={0}
          max={1}
          step={0.05}
        />
        <NumberRow
          settingKey="weight_authority"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
          min={0}
          max={1}
          step={0.05}
        />
        <NumberRow
          settingKey="weight_uniqueness"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
          min={0}
          max={1}
          step={0.05}
        />
      </Section>

      {/* Freshness */}
      <Section
        title="Freshness decay"
        description="Controls how fast articles lose value over time. Higher λ = faster decay."
      >
        <NumberRow
          settingKey="freshness_lambda"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
          min={0}
          max={1}
          step={0.01}
        />
      </Section>

      {/* Scheduler */}
      <Section title="Scheduler" description="Control the automatic pipeline runs.">
        <BooleanRow
          settingKey="scheduler_enabled"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
        />
        <StringRow
          settingKey="fetch_interval"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
        />
        <BooleanRow
          settingKey="analyze_enabled"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
        />
        <NumberRow
          settingKey="analyze_batch_size"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
          min={1}
          step={10}
        />
        <BooleanRow
          settingKey="summarize_enabled"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
        />
        <NumberRow
          settingKey="summarize_batch_size"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
          min={1}
          step={10}
        />
      </Section>

      {/* LLM models */}
      <Section
        title="LLM models"
        description="Which model each task uses. Changes take effect on the next LLM call."
      >
        <StringRow
          settingKey="llm_model_analyze"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
        />
        <StringRow
          settingKey="llm_model_analyze_fallback"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
        />
        <StringRow
          settingKey="llm_model_summarize"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
        />
        <StringRow
          settingKey="llm_model_summarize_fallback"
          getValue={getValue}
          getDescription={getDescription}
          onSave={save}
          busy={busy}
        />
      </Section>

      {/* Tag vocabulary */}
      <Section
        title="Tag vocabulary"
        description="Allowed tags the analyze LLM can pick from. Changes apply to future articles only."
      >
        <TagList
          tags={getValue<string[]>("allowed_tags", [])}
          onSave={(tags) => save("allowed_tags", tags)}
          busy={busy === "allowed_tags"}
        />
      </Section>

      {/* Pipeline control */}
      <Section
        title="Pipeline control"
        description="Manually trigger pipeline steps. Use when you want results now instead of waiting for the scheduler."
      >
        <div className="flex gap-2 flex-wrap">
          <Button onClick={runFetch} disabled={busy !== null} size="sm">
            {busy === "pipeline-fetch" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Fetch now
          </Button>
          <Button onClick={runAnalyze} disabled={busy !== null} size="sm">
            {busy === "pipeline-analyze" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Analyze now
          </Button>
          <Button onClick={runSummarize} disabled={busy !== null} size="sm">
            {busy === "pipeline-summarize" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Summarize now
          </Button>
          <Button onClick={runAll} disabled={busy !== null} size="sm" variant="default">
            {busy === "pipeline-run-all" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run full pipeline
          </Button>
        </div>

        {(pipelineStats.fetch ||
          pipelineStats.analyze ||
          pipelineStats.summarize ||
          pipelineStats.error) && (
          <div className="mt-4 p-3 rounded-lg border bg-muted/40 text-sm">
            {pipelineStats.error ? (
              <p className="text-destructive">Error: {pipelineStats.error}</p>
            ) : (
              <>
                {pipelineStats.fetch && (
                  <p>
                    Fetched {pipelineStats.fetch.added} new articles from{" "}
                    {pipelineStats.fetch.feeds} feeds
                    {pipelineStats.fetch.errors > 0 && ` (${pipelineStats.fetch.errors} errors)`}
                  </p>
                )}
                {pipelineStats.analyze && (
                  <p>
                    Analyzed {pipelineStats.analyze.analyzed} articles
                    {pipelineStats.analyze.errors > 0 &&
                      ` (${pipelineStats.analyze.errors} errors)`}
                  </p>
                )}
                {pipelineStats.summarize && (
                  <p>
                    Summarized {pipelineStats.summarize.summarized} articles
                    {pipelineStats.summarize.errors > 0 &&
                      ` (${pipelineStats.summarize.errors} errors)`}
                  </p>
                )}
                {pipelineStats.lastRunAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last run: {new Date(pipelineStats.lastRunAt).toLocaleTimeString()}
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

// --- Reusable row components ---

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

interface RowProps {
  settingKey: string;
  getValue: <T>(key: string, fallback: T) => T;
  getDescription: (key: string) => string;
  onSave: (key: string, value: unknown) => Promise<void>;
  busy: string | null;
}

function NumberRow({
  settingKey,
  getValue,
  getDescription,
  onSave,
  busy,
  min,
  max,
  step,
}: RowProps & { min?: number; max?: number; step?: number }) {
  const [local, setLocal] = useState(String(getValue(settingKey, 0)));
  const current = String(getValue(settingKey, 0));
  // Keep local in sync if external change
  if (local !== current && busy !== settingKey) {
    setLocal(current);
  }

  async function commit() {
    const num = Number.parseFloat(local);
    if (Number.isFinite(num) && num !== Number.parseFloat(current)) {
      await onSave(settingKey, num);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_200px] gap-4 items-start">
      <div>
        <Label htmlFor={settingKey}>{LABELS[settingKey] ?? settingKey}</Label>
        {getDescription(settingKey) && (
          <p className="text-xs text-muted-foreground mt-0.5">{getDescription(settingKey)}</p>
        )}
      </div>
      <Input
        id={settingKey}
        type="number"
        value={local}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        disabled={busy === settingKey}
        className="h-8"
      />
    </div>
  );
}

function BooleanRow({ settingKey, getValue, getDescription, onSave, busy }: RowProps) {
  const checked = getValue<boolean>(settingKey, false);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
      <div>
        <Label htmlFor={settingKey}>{LABELS[settingKey] ?? settingKey}</Label>
        {getDescription(settingKey) && (
          <p className="text-xs text-muted-foreground mt-0.5">{getDescription(settingKey)}</p>
        )}
      </div>
      <Switch
        id={settingKey}
        checked={checked}
        onCheckedChange={(v: boolean) => onSave(settingKey, v)}
        disabled={busy === settingKey}
      />
    </div>
  );
}

function StringRow({ settingKey, getValue, getDescription, onSave, busy }: RowProps) {
  const [local, setLocal] = useState(getValue(settingKey, ""));
  const current = getValue<string>(settingKey, "");
  if (local !== current && busy !== settingKey) {
    setLocal(current);
  }

  async function commit() {
    if (local !== current) {
      await onSave(settingKey, local);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_280px] gap-4 items-start">
      <div>
        <Label htmlFor={settingKey}>{LABELS[settingKey] ?? settingKey}</Label>
        {getDescription(settingKey) && (
          <p className="text-xs text-muted-foreground mt-0.5">{getDescription(settingKey)}</p>
        )}
      </div>
      <Input
        id={settingKey}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        disabled={busy === settingKey}
        className="h-8"
      />
    </div>
  );
}

function TagList({
  tags,
  onSave,
  busy,
}: {
  tags: string[];
  onSave: (tags: string[]) => Promise<void>;
  busy: boolean;
}) {
  const [newTag, setNewTag] = useState("");

  async function addTag() {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    await onSave([...tags, trimmed]);
    setNewTag("");
  }

  async function removeTag(tag: string) {
    await onSave(tags.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && <p className="text-xs text-muted-foreground">No tags configured.</p>}
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={busy}
              className="hover:bg-muted-foreground/20 rounded p-0.5"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
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
              void addTag();
            }
          }}
          disabled={busy}
          className="h-8 max-w-xs"
        />
        <Button onClick={addTag} disabled={busy || !newTag.trim()} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}

// Suppress unused import warning for Separator — keeping import for future use
void Separator;
