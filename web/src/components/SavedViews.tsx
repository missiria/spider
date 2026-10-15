"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, Pencil, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { createView, deleteView, errorMessage, listViews, updateView } from "@/lib/api";
import type { SavedView, ViewScope } from "@/lib/types";
import { Button } from "./ui";

/**
 * Dropdown of saved views for a scope (+ property). `current` is the config that
 * "Save as…" stores; `onLoad` receives a view's config to apply.
 */
export function SavedViews({
  scope,
  propertyId,
  current,
  onLoad,
}: {
  scope: ViewScope;
  propertyId?: number;
  current: Record<string, unknown>;
  onLoad: (config: Record<string, unknown>) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [selected, setSelected] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await listViews(scope, propertyId);
      setViews(res.items);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [scope, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = (id: number | "") => {
    setSelected(id);
    const v = views.find((x) => x.id === id);
    if (v) onLoad(v.config);
  };

  const saveAs = async () => {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    setBusy(true);
    try {
      const v = await createView({ scope, property_id: propertyId, name: name.trim(), config: current });
      await load();
      setSelected(v.id);
      toast.success(`View "${v.name}" saved`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const overwrite = async () => {
    if (selected === "") return;
    setBusy(true);
    try {
      await updateView(selected, { config: current });
      await load();
      toast.success("View updated with the current filters");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    const v = views.find((x) => x.id === selected);
    if (!v) return;
    const name = window.prompt("Rename view", v.name);
    if (!name?.trim() || name.trim() === v.name) return;
    setBusy(true);
    try {
      await updateView(v.id, { name: name.trim() });
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const v = views.find((x) => x.id === selected);
    if (!v || !window.confirm(`Delete view "${v.name}"?`)) return;
    setBusy(true);
    try {
      await deleteView(v.id);
      setSelected("");
      await load();
      toast.success("View deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Bookmark className="h-4 w-4 text-muted" aria-hidden />
      <select value={selected} onChange={(e) => pick(e.target.value ? Number(e.target.value) : "")} aria-label="Saved views" className="rounded-md border border-border bg-surface px-2 py-1.5 outline-none focus:border-primary">
        <option value="">{views.length ? "Saved views…" : "No saved views"}</option>
        {views.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <Button variant="secondary" type="button" disabled={busy} onClick={saveAs}>
        Save as…
      </Button>
      {selected !== "" && (
        <>
          <Button variant="secondary" type="button" disabled={busy} onClick={overwrite} title="Overwrite this view with the current filters">
            Update
          </Button>
          <button type="button" disabled={busy} onClick={rename} aria-label="Rename view" title="Rename" className="rounded-md p-1.5 text-muted hover:bg-surface-muted hover:text-foreground">
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" disabled={busy} onClick={remove} aria-label="Delete view" title="Delete" className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger">
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
