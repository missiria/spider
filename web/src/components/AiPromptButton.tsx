"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Check, ChevronDown, Copy } from "lucide-react";
import { logPromptCopied } from "@/lib/api";
import {
  buildOpportunityPrompt,
  LANG_LABELS,
  PROMPT_LANGS,
  PROMPT_VARIANTS,
  VARIANT_LABELS,
  type PromptLang,
  type PromptVariant,
} from "@/lib/aiPrompt";
import { copyText } from "@/lib/exportTable";
import type { OpportunityDetail, PropertyRow } from "@/lib/types";

const PREF_KEY = "spider-ai-prompt";
const COPIED_MS = 2000;

interface Pref {
  variant: PromptVariant;
  lang: PromptLang;
}

function readPref(): Pref {
  const pref: Pref = { variant: "explain", lang: "en" };
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREF_KEY) ?? "{}") as {
      variant?: unknown;
      lang?: unknown;
    };
    if (PROMPT_VARIANTS.includes(raw.variant as PromptVariant))
      pref.variant = raw.variant as PromptVariant;
    if (PROMPT_LANGS.includes(raw.lang as PromptLang))
      pref.lang = raw.lang as PromptLang;
  } catch {
    /* per-browser convenience only */
  }
  return pref;
}

function writePref(pref: Pref) {
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify(pref));
  } catch {
    /* per-browser convenience only */
  }
}

/**
 * "Copy AI prompt" on the opportunity page (MISS-0190): one click copies a self-contained
 * prompt describing the opportunity; the caret opens a preview where the variant and the
 * output language can be changed and the text edited before copying. The last variant and
 * language are remembered per browser.
 */
export function AiPromptButton({
  opportunity,
  property,
  users,
}: {
  opportunity: OpportunityDetail;
  property: PropertyRow | null;
  users: Map<number, string>;
}) {
  const [pref, setPref] = useState<Pref>(readPref);
  const [open, setOpen] = useState(false);
  /** text edited in the preview; null = the generated prompt */
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState<"main" | "preview" | null>(null);
  const [announce, setAnnounce] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLButtonElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const panelId = useId();

  const prompt = useMemo(
    () =>
      buildOpportunityPrompt(opportunity, property, {
        ...pref,
        users,
        origin:
          typeof window === "undefined" ? undefined : window.location.origin,
      }),
    [opportunity, property, users, pref],
  );

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), COPIED_MS);
    return () => clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const change = (next: Partial<Pref>) => {
    const merged = { ...pref, ...next };
    setPref(merged);
    setDraft(null);
    writePref(merged);
  };

  const copy = async (text: string, source: "main" | "preview") => {
    const res = await copyText(text);
    if (res.ok) {
      setCopied(source);
      setAnnounce("AI prompt copied to the clipboard");
      // usage trace only: copying must never fail because logging did
      logPromptCopied(opportunity.id, pref).catch(() => undefined);
      return;
    }
    const message =
      "Could not copy the prompt. Select the text in the preview and copy it manually.";
    setAnnounce(message);
    toast.error(message);
    setOpen(true);
    requestAnimationFrame(() => {
      area.current?.focus();
      area.current?.select();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (open && e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      caret.current?.focus();
    }
  };

  const part =
    "inline-flex cursor-pointer items-center justify-center gap-2 border border-border bg-surface py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
  const field =
    "mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:border-primary";

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <div className="inline-flex">
        <button
          type="button"
          onClick={() => void copy(prompt, "main")}
          className={`${part} rounded-l-md px-3`}
        >
          {copied === "main" ? (
            <Check className="h-4 w-4 text-success" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied === "main" ? "Copied" : "Copy AI prompt"}
        </button>
        <button
          ref={caret}
          type="button"
          aria-label="Preview and options for the AI prompt"
          title="Preview and options"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={`${part} -ml-px rounded-r-md px-2`}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="AI prompt preview"
          className="absolute left-0 z-30 mt-1 w-[min(42rem,calc(100vw-2rem))] rounded-md border border-border bg-surface p-4 text-sm shadow-lg lg:left-auto lg:right-0"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-muted">Prompt type</span>
              <select
                autoFocus
                value={pref.variant}
                onChange={(e) =>
                  change({ variant: e.target.value as PromptVariant })
                }
                className={field}
              >
                {PROMPT_VARIANTS.map((v) => (
                  <option key={v} value={v}>
                    {VARIANT_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-muted">Answer language</span>
              <select
                value={pref.lang}
                onChange={(e) => change({ lang: e.target.value as PromptLang })}
                className={field}
              >
                {PROMPT_LANGS.map((l) => (
                  <option key={l} value={l}>
                    {LANG_LABELS[l]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <label htmlFor={`${panelId}-text`} className="text-muted">
              Prompt {draft !== null && "(edited)"}
            </label>
            <div className="flex items-center gap-1">
              {draft !== null && (
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="cursor-pointer rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => void copy(draft ?? prompt, "preview")}
                aria-label={
                  copied === "preview" ? "Prompt copied" : "Copy this prompt"
                }
                title={copied === "preview" ? "Copied" : "Copy this prompt"}
                className="grid h-8 w-8 cursor-pointer place-items-center rounded-md text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                {copied === "preview" ? (
                  <Check className="h-4 w-4 text-success" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </div>
          <textarea
            ref={area}
            id={`${panelId}-text`}
            value={draft ?? prompt}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-primary"
          />
          <p className="mt-2 text-xs text-muted">
            Paste it into Claude, ChatGPT or another assistant. The button
            copies the prompt as generated; edits here are copied with the icon
            above.
          </p>
        </div>
      )}
    </div>
  );
}
