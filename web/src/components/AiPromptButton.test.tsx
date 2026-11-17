// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpportunityDetail } from "@/lib/types";

const logPromptCopied = vi.fn();
vi.mock("@/lib/api", () => ({
  logPromptCopied: (...args: unknown[]) => logPromptCopied(...args),
}));
const toastError = vi.fn();
vi.mock("react-toastify", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

import { AiPromptButton } from "./AiPromptButton";

const opportunity: OpportunityDetail = {
  id: 42,
  property_id: 3,
  rule: "near_page_one",
  subject: "query",
  key_text: "iptv test",
  status: "open",
  priority: "medium",
  score: 55,
  confidence: "medium",
  title: 'Near page one: "iptv test"',
  reason: "Average position between 8 and 20.",
  suggested_action: "Strengthen the ranking page.",
  evidence: {
    period: { start: "2026-10-18", end: "2026-11-14" },
    current: { clicks: 12, impressions: 2300, ctr: 0.0052, position: 11.3 },
  },
  assignee_id: null,
  due_date: null,
  completed_at: null,
  dismissed_at: null,
  first_seen_at: "2026-11-10T04:00:00.000Z",
  last_seen_at: "2026-11-17T04:00:00.000Z",
  events: [],
  impact: null,
};

const renderButton = () =>
  render(
    <AiPromptButton
      opportunity={opportunity}
      property={null}
      users={new Map()}
    />,
  );

describe("AiPromptButton", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    // the vitest config restores mocks between tests: set the behaviour each time
    logPromptCopied.mockReset().mockResolvedValue(undefined);
    toastError.mockClear();
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("copies the prompt in one click, confirms it and logs the use", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Copy AI prompt" }));
    await screen.findByRole("button", { name: "Copied" });
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain('- Query: "iptv test"');
    expect(text).toContain("| Impressions | 2,300 |");
    expect(text).toContain("/opportunities/42");
    expect(screen.getByRole("status").textContent).toBe(
      "AI prompt copied to the clipboard",
    );
    expect(logPromptCopied).toHaveBeenCalledWith(42, {
      variant: "explain",
      lang: "en",
    });
  });

  it("previews exactly what the button copies", async () => {
    renderButton();
    fireEvent.click(
      screen.getByRole("button", { name: /Preview and options/ }),
    );
    const preview = (screen.getByRole("textbox") as HTMLTextAreaElement).value;
    fireEvent.click(screen.getByRole("button", { name: "Copy AI prompt" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toBe(preview);
  });

  it("switches variant and language, and remembers the choice", () => {
    const first = renderButton();
    fireEvent.click(
      screen.getByRole("button", { name: /Preview and options/ }),
    );
    fireEvent.change(screen.getByLabelText("Prompt type"), {
      target: { value: "ticket" },
    });
    fireEvent.change(screen.getByLabelText("Answer language"), {
      target: { value: "fr" },
    });
    const area = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(area.value).toContain("ticket de travail");
    expect(area.value).toContain("Réponds en français.");
    expect(
      JSON.parse(window.localStorage.getItem("spider-ai-prompt")!),
    ).toEqual({ variant: "ticket", lang: "fr" });
    first.unmount();

    renderButton();
    fireEvent.click(
      screen.getByRole("button", { name: /Preview and options/ }),
    );
    expect(
      (screen.getByLabelText("Prompt type") as HTMLSelectElement).value,
    ).toBe("ticket");
    expect(
      (screen.getByLabelText("Answer language") as HTMLSelectElement).value,
    ).toBe("fr");
  });

  it("copies the edited text from the preview icon", async () => {
    renderButton();
    fireEvent.click(
      screen.getByRole("button", { name: /Preview and options/ }),
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "my own prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy this prompt" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("my own prompt"),
    );
    await screen.findByRole("button", { name: "Prompt copied" });
  });

  it("closes the preview with Escape and returns focus to the caret", () => {
    renderButton();
    const caret = screen.getByRole("button", { name: /Preview and options/ });
    fireEvent.click(caret);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Prompt type"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(caret);
    expect(caret.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the preview for a manual copy when the clipboard is blocked", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(document, "execCommand", {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Copy AI prompt" }));
    await screen.findByRole("dialog");
    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/Could not copy the prompt/),
    );
    expect(logPromptCopied).not.toHaveBeenCalled();
  });
});
