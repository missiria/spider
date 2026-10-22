"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { ImageUp, Trash2 } from "lucide-react";
import {
  brandLogoUrl,
  deleteBrandLogo,
  errorMessage,
  getSettings,
  putBrand,
  putBrandLogo,
} from "@/lib/api";
import {
  cleanBrand,
  footerLines,
  headerName,
  logoProblem,
  MAX_LOGO_BYTES,
} from "@/lib/brand";
import type { Brand, LogoMeta } from "@/lib/types";
import { Button, Card } from "./ui";

const FIELDS: {
  key: keyof Brand;
  label: string;
  max: number;
  type?: string;
  hint?: string;
  wide?: boolean;
}[] = [
  { key: "name", label: "Brand name (PDF header)", max: 80 },
  { key: "trading_name", label: "Public / trading name", max: 120 },
  {
    key: "legal_name",
    label: "Legal entity name",
    max: 120,
    hint: "As registered, e.g. on Companies House.",
  },
  { key: "company_number", label: "Company / registration number", max: 40 },
  { key: "contact_email", label: "Contact email", max: 120, type: "email" },
  {
    key: "website",
    label: "Website",
    max: 200,
    type: "text",
    hint: "https:// is added when missing.",
  },
];

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Settings → Report branding (MISS-0094, extended MISS-0135): display brand, legal entity
 * profile and approved logo of THIS workspace, with a live preview of the PDF header and
 * footer before saving, and a plain list of what is missing and which fallback is used.
 */
export function BrandSettings({
  initial,
  logo: initialLogo,
  missing: initialMissing,
  isAdmin,
}: {
  initial: Brand;
  logo: LogoMeta | null;
  missing: string[];
  isAdmin: boolean;
}) {
  const [brand, setBrand] = useState<Brand>({
    ...initial,
    accent_color: initial.accent_color ?? "#4f46e5",
  });
  const [logo, setLogo] = useState<LogoMeta | null>(initialLogo);
  const [logoVersion, setLogoVersion] = useState(() => Date.now());
  const [pending, setPending] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [missing, setMissing] = useState(initialMissing);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const pendingUrl = useMemo(
    () => (pending ? URL.createObjectURL(pending) : null),
    [pending],
  );
  useEffect(
    () => () => void (pendingUrl && URL.revokeObjectURL(pendingUrl)),
    [pendingUrl],
  );

  const previewLogo =
    pendingUrl ?? (logo && !removeLogo ? brandLogoUrl(logoVersion) : null);
  const clean = cleanBrand(brand);
  const name = headerName(clean);
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accent_color ?? "")
    ? brand.accent_color
    : "#4f46e5";
  const dirty =
    JSON.stringify(clean) !==
      JSON.stringify(
        cleanBrand({
          ...initial,
          accent_color: initial.accent_color ?? "#4f46e5",
        }),
      ) ||
    pending !== null ||
    removeLogo;

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = logoProblem(file);
    if (problem) {
      toast.error(problem);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setPending(file);
    setRemoveLogo(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setBrand({
        ...(await putBrand(clean)),
        accent_color: clean.accent_color ?? "#4f46e5",
      });
      if (pending) {
        setLogo(await putBrandLogo(pending));
        setLogoVersion(Date.now());
        setPending(null);
        if (fileInput.current) fileInput.current.value = "";
      } else if (removeLogo) {
        await deleteBrandLogo();
        setLogo(null);
        setRemoveLogo(false);
      }
      setMissing((await getSettings()).branding_missing);
      toast.success("Report branding saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const input =
    "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 disabled:opacity-70";
  return (
    <Card className="p-6">
      <h2 className="font-medium">Report branding</h2>
      <p className="mt-1 text-sm text-muted">
        Printed on this workspace&apos;s PDF reports: logo and brand name in the
        header, legal details, date and page number in the footer of every page.
        Other workspaces never see these details.
      </p>

      {missing.length > 0 && (
        <div
          className="mt-4 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning"
          role="note"
        >
          <p className="font-medium">
            Not configured yet. PDFs use a text-only fallback:
          </p>
          <ul className="mt-1 list-disc pl-4">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={save} className="mt-4 grid gap-6">
        <fieldset
          className="grid content-start gap-3 text-sm"
          disabled={!isAdmin || busy}
        >
          <legend className="sr-only">Brand and legal entity</legend>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`brand-${f.key}`} className="text-muted">
                {f.label}
              </label>
              <input
                id={`brand-${f.key}`}
                type={f.type ?? "text"}
                value={brand[f.key] ?? ""}
                maxLength={f.max}
                onChange={(e) =>
                  setBrand({ ...brand, [f.key]: e.target.value })
                }
                className={input}
                autoComplete="off"
                aria-describedby={f.hint ? `brand-${f.key}-hint` : undefined}
              />
              {f.hint && (
                <p
                  id={`brand-${f.key}-hint`}
                  className="mt-0.5 text-xs text-muted"
                >
                  {f.hint}
                </p>
              )}
            </div>
          ))}
          <div>
            <label htmlFor="brand-registered_address" className="text-muted">
              Registered address
            </label>
            <textarea
              id="brand-registered_address"
              value={brand.registered_address ?? ""}
              maxLength={300}
              rows={3}
              onChange={(e) =>
                setBrand({ ...brand, registered_address: e.target.value })
              }
              className={input}
              aria-describedby="brand-address-hint"
            />
            <p id="brand-address-hint" className="mt-0.5 text-xs text-muted">
              One line per address line; printed on one footer line, wrapped
              when long.
            </p>
          </div>
          <label className="block">
            <span className="text-muted">Footer line</span>
            <input
              value={brand.footer ?? ""}
              maxLength={160}
              onChange={(e) => setBrand({ ...brand, footer: e.target.value })}
              className={input}
              placeholder="e.g. Confidential: prepared for the client"
            />
          </label>
          <div className="block">
            <span className="text-muted">Accent colour</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={accent}
                onChange={(e) =>
                  setBrand({ ...brand, accent_color: e.target.value })
                }
                aria-label="Accent colour"
                className="h-9 w-12 cursor-pointer rounded border border-border"
              />
              <code className="text-xs">{accent}</code>
            </div>
          </div>
          <div className="block">
            <span className="text-muted">Logo</span>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                ref={fileInput}
                id="brand-logo"
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => pick(e.target.files?.[0])}
              />
              <label
                htmlFor="brand-logo"
                className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted focus-within:outline-2 focus-within:outline-primary"
              >
                <ImageUp className="h-4 w-4" aria-hidden />{" "}
                {logo || pending ? "Replace logo" : "Choose logo"}
              </label>
              {(logo || pending) && !removeLogo && (
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    if (fileInput.current) fileInput.current.value = "";
                    setRemoveLogo(!!logo);
                  }}
                  className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-danger hover:bg-danger-soft"
                >
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </button>
              )}
            </div>
            <span className="mt-0.5 block text-xs text-muted">
              {pending
                ? `${pending.name} selected; saved with the form.`
                : removeLogo
                  ? "The logo will be removed when you save."
                  : logo
                    ? `Current logo: ${logo.width} × ${logo.height} px, ${Math.round(logo.bytes / 1024)} KB.`
                    : "None."}{" "}
              PNG or JPEG, up to {MAX_LOGO_BYTES / 1024} KB. Printed at its own
              proportions, never stretched or recoloured.
            </span>
          </div>
          {isAdmin && (
            <div>
              <Button type="submit" disabled={busy || !dirty}>
                {busy ? "Saving…" : "Save branding"}
              </Button>
            </div>
          )}
        </fieldset>

        <div
          aria-label="PDF header and footer preview"
          role="group"
          className="max-w-md"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Preview{dirty ? " (unsaved changes)" : ""}
          </p>
          {/* a scaled A4 page: header band, body placeholder, footer band — always light like the PDF */}
          <div
            className="mt-2 flex aspect-[1/1.414] max-h-[32rem] w-full flex-col rounded-md border border-border bg-white p-5 text-slate-900 shadow-sm"
            data-testid="brand-preview"
          >
            <div className="flex min-h-[42px] min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 pb-2">
              {previewLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewLogo}
                  alt="Logo preview"
                  className="h-auto max-h-[42px] w-auto max-w-[min(210px,100%)] object-contain"
                />
              )}
              {name && !previewLogo && (
                <span className="text-base font-bold" style={{ color: accent }}>
                  {name}
                </span>
              )}
              {name && previewLogo && (
                <span className="min-w-0 break-words text-xs font-semibold text-slate-600">
                  {name}
                </span>
              )}
              {!name && !previewLogo && (
                <span className="text-xs font-semibold text-slate-600">
                  Search performance report
                </span>
              )}
            </div>
            <div className="flex-1 py-4">
              <p
                className="text-[11px] font-semibold"
                style={{ color: accent }}
              >
                Search performance report
              </p>
              <p className="mt-1 text-lg font-bold">Report title</p>
              <div className="mt-3 space-y-1.5" aria-hidden>
                {["w-11/12", "w-4/5", "w-5/6", "w-2/3", "w-3/4"].map((w) => (
                  <div key={w} className={`h-2 rounded bg-slate-100 ${w}`} />
                ))}
              </div>
            </div>
            <div className="border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500">
              {footerLines(clean).map((l) => (
                <p key={l} className="break-words">
                  {l}
                </p>
              ))}
              <div className="flex justify-between">
                <span>Generated {today()}</span>
                <span>Page 1 of 3</span>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Card>
  );
}
