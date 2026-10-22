"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, ErrorBox, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";

type Brand = {
  name: string;
  logoUrl: string;
  accentColor: string;
  supportEmail: string;
  company: string;
  footer: string;
  websiteUrl: string;
};
type Revision = {
  id: number;
  status: string;
  actor_id: number;
  created_at: string;
};
type Settings = {
  draft: Brand;
  draftId: number | null;
  published: Brand;
  history: Revision[];
};
const fields: {
  key: keyof Brand;
  label: string;
  type?: string;
  max: number;
}[] = [
  { key: "name", label: "Brand name", max: 80 },
  {
    key: "logoUrl",
    label: "Logo image URL (public HTTPS)",
    type: "url",
    max: 1000,
  },
  { key: "accentColor", label: "Accent color (#RRGGBB)", max: 7 },
  { key: "supportEmail", label: "Support email", type: "email", max: 254 },
  { key: "company", label: "Company details", max: 160 },
  { key: "websiteUrl", label: "Website URL (HTTPS)", type: "url", max: 1000 },
  { key: "footer", label: "Shared footer", max: 500 },
];
const templates = [
  "confirmation",
  "approved",
  "rejected",
  "created",
  "reset",
  "operator",
  "alert",
  "report",
];

export function EmailBrandEditor() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [template, setTemplate] = useState("confirmation");
  const [html, setHtml] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api
      .get<Settings>("/admin/email-brand")
      .then(({ data }) => {
        setSettings(data);
        setBrand(data.draft);
      })
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  async function action(kind: "draft" | "preview" | "test" | "publish") {
    if (!brand || !settings) return;
    setBusy(true);
    setError(null);
    setNotice("");
    let savedId: number | null = null;
    try {
      if (kind === "publish") {
        if (dirty || !settings.draftId)
          throw new Error("Save the draft before publishing.");
        await api.post(`/admin/email-brand/publish/${settings.draftId}`);
      } else {
        const { data } = await api.post(
          `/admin/email-brand/${kind}?template=${template}`,
          brand,
        );
        if (kind === "draft") savedId = data.id as number;
        if (kind === "preview") {
          setHtml(data.html as string);
          setText(data.text as string);
        }
        if (kind === "test")
          setNotice(
            data.sent
              ? `Test email sent to ${data.to as string}.`
              : "Email was not sent. Configure SMTP on the server first.",
          );
      }
      if (kind === "draft" || kind === "publish") {
        const { data } = await api.get<Settings>("/admin/email-brand");
        setSettings({
          ...data,
          draft: brand,
          draftId: kind === "draft" ? savedId : null,
        });
        setDirty(false);
        setNotice(
          kind === "publish"
            ? "Branding published. All future emails use this layout."
            : "Draft saved. Live emails are unchanged.",
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/system" className="text-sm text-muted">
          ← System
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Email branding</h1>
        <p className="mt-2 text-sm text-muted">
          One header, logo, and footer for every email. Preview a draft, then
          publish it globally.
        </p>
      </div>
      {error && <ErrorBox message={error} />}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-4 text-sm"
        >
          {notice}
        </p>
      )}
      {!brand ? (
        !error && <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-5">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void action("draft");
              }}
            >
              <h2 className="font-semibold">Shared identity</h2>
              {fields.map(({ key, label, type, max }) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1.5 block">{label}</span>
                  <input
                    disabled={busy}
                    required={key !== "company" && key !== "footer"}
                    type={type ?? "text"}
                    maxLength={max}
                    pattern={
                      key === "accentColor" ? "#[0-9a-fA-F]{6}" : undefined
                    }
                    value={brand[key]}
                    onChange={(e) => {
                      setBrand({ ...brand, [key]: e.target.value });
                      setDirty(true);
                      setHtml("");
                      setText("");
                    }}
                    className="w-full rounded-md border border-border bg-surface px-3 py-2"
                  />
                </label>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} type="submit">
                  Save draft
                </Button>
                <Button
                  disabled={busy || dirty || !settings?.draftId}
                  variant="secondary"
                  type="button"
                  onClick={() => void action("publish")}
                >
                  Publish branding
                </Button>
              </div>
              <p className="text-xs text-muted">
                SMTP sender identity remains configured on the server. This page
                controls email appearance and support details.
              </p>
            </form>
          </Card>
          <Card className="space-y-4 p-5">
            <h2 className="font-semibold">Email preview</h2>
            <label className="block text-sm">
              Email type
              <select
                disabled={busy}
                value={template}
                onChange={(e) => {
                  setTemplate(e.target.value);
                  setHtml("");
                  setText("");
                }}
                className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2"
              >
                {templates.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => void action("preview")}>
                Refresh preview
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void action("test")}
              >
                Send test to me
              </Button>
            </div>
            {html ? (
              <>
                <iframe
                  title="Branded email preview"
                  sandbox=""
                  referrerPolicy="no-referrer"
                  srcDoc={html}
                  className="h-[600px] w-full rounded-md border border-border bg-white"
                />
                <details className="text-sm">
                  <summary>Plain-text alternative</summary>
                  <pre className="mt-3 whitespace-pre-wrap break-words text-xs">
                    {text}
                  </pre>
                </details>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted">
                Choose an email type and refresh the preview.
              </p>
            )}
            <p className="text-xs text-muted">
              Previews use sample data and example links. Tests are sent only to
              your signed-in account.
            </p>
          </Card>
        </div>
      )}
      {settings && (
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Revision history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Revision</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Admin ID</th>
                  <th className="p-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {settings.history.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-2">{r.id}</td>
                    <td className="p-2">{r.status}</td>
                    <td className="p-2">{r.actor_id}</td>
                    <td className="p-2">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
