"use client";

import { useState, useMemo, useRef } from "react";
import { UbuntuTerminal } from "@/src/components/UbuntuTerminal";
import { VFS } from "@/src/lib/shell/fs.js";
import { useMidnightHardReset } from "@/src/hooks/use-midnight-hard-reset.js";
import { downloadTerminalScreenshot } from "@/src/lib/download-terminal-screenshot.js";

export const dynamic = "force-dynamic";

/**
 * TerminalWorkspace — manages single/split terminal layout.
 *
 * Both terminals share one VFS so files created in Terminal 1 are
 * immediately visible in Terminal 2, and vice versa.
 */
function TerminalWorkspace() {
  const [split, setSplit] = useState(false);
  const [takingScreenshot, setTakingScreenshot] = useState(false);
  const terminalGridRef = useRef(null);

  // Create one shared VFS instance at the workspace level.
  // useMemo with [] ensures it is only created once.
  const sharedFs = useMemo(() => new VFS(), []);
  useMidnightHardReset(sharedFs);

  const toggleSplit = () => {
    setSplit((current) => {
      const next = !current;
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("ubuntu-terminal-focus", { detail: { instanceId: next ? 1 : 0 } }));
      });
      return next;
    });
  };

  const takeScreenshot = async () => {
    if (takingScreenshot) return;
    setTakingScreenshot(true);
    try {
      await downloadTerminalScreenshot(terminalGridRef.current);
    } catch (error) {
      window.alert(`Unable to take terminal screenshot: ${error.message}`);
    } finally {
      setTakingScreenshot(false);
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("ubuntu-terminal-focus", { detail: { instanceId: split ? 1 : 0 } }));
      });
    }
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between shrink-0">
        <p className="text-sm text-muted-foreground">
          {split
            ? "Split view — both terminals share the same filesystem."
            : "Single terminal — click Split to open a second terminal side-by-side."}
        </p>
        <div className="flex items-center gap-2">
          <a
            href="/Operating_System_Lab_Manual.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-term-blue/40 bg-term-blue/10 px-3 py-1.5 text-sm font-medium text-term-blue hover:bg-term-blue/20 transition-all duration-200"
            title="Open the Operating Systems lab manual"
          >
            <BookIcon className="size-4" />
            Lab Manual
          </a>
          {/* Screenshot button temporarily disabled.
          <button
            type="button"
            onClick={takeScreenshot}
            disabled={takingScreenshot}
            className="flex items-center gap-1.5 rounded-lg border border-term-yellow/40 bg-term-yellow/10 px-3 py-1.5 text-sm font-medium text-term-yellow hover:bg-term-yellow/20 transition-all duration-200 disabled:cursor-wait disabled:opacity-60"
            title="Download a screenshot of the terminal area"
          >
            <CameraIcon className="size-4" />
            {takingScreenshot ? "Capturing…" : "Take Screenshot"}
          </button>
          */}
          <button
            type="button"
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.confirm(
                  "Hard Reset will stop all running processes, erase all cached memory & files, and restart the terminal. Continue?"
                )
              ) {
                window.localStorage.clear();
                window.location.reload();
              }
            }}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-500/20 transition-all duration-200"
            title="Erase cached memory & stop stuck processes"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Hard Reset
          </button>
          <button
            type="button"
            onClick={toggleSplit}
            className={[
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-200",
              split
                ? "border-term-red/40 bg-term-red/10 text-term-red hover:bg-term-red/20"
                : "border-term-green/40 bg-term-green/10 text-term-green hover:bg-term-green/20",
            ].join(" ")}
          >
            {split ? (
              <>
                <SplitIcon className="size-4 rotate-90" />
                Unsplit
              </>
            ) : (
              <>
                <SplitIcon className="size-4" />
                Split Terminal
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Terminal pane(s) ── */}
      <div
        ref={terminalGridRef}
        className={[
          "grid gap-3 flex-1 min-h-0",
          split ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
        ].join(" ")}
      >
        {/* Terminal 1 — always visible */}
        <div className="relative min-h-0 h-full w-full">
          <UbuntuTerminal
            sharedFs={sharedFs}
            label={split ? "Terminal 1" : null}
            instanceId={0}
            showClose={false}
          />
        </div>

        {/* Terminal 2 — only in split mode */}
        {split && (
          <div className="relative min-h-0 h-full w-full">
            <UbuntuTerminal
              sharedFs={sharedFs}
              label="Terminal 2"
              instanceId={1}
              showClose={true}
              onClose={() => setSplit(false)}
            />
          </div>
        )}
      </div>

      {/* ── Feature cards ── */}
      <section className="mt-2 grid gap-4 sm:grid-cols-3 hidden sm:grid shrink-0">
        {[
          {
            title: "Shell scripting",
            body: "Variables, if/for/while, functions, pipes, redirection, globs, $(...) and arithmetic.",
          },
          {
            title: "C practicals",
            body: "gcc hello.c -o hello then ./hello — printf, scanf, fork, wait, getpid all work correctly.",
          },
          {
            title: "Process simulation",
            body: "fork(), zombie & orphan processes, ps -el | grep Z — OS Practical 8 fully supported.",
          },
        ].map((card) => (
          <article key={card.title} className="rounded-lg border border-border bg-card p-3">
            <h2 className="text-sm font-semibold text-card-foreground">{card.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

/** Simple split-screen icon */
function SplitIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}

function BookIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

function CameraIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3Z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="h-screen bg-background px-4 py-2 sm:py-4 font-sans overflow-hidden flex flex-col">
      <div className="mx-auto max-w-7xl flex-1 flex flex-col min-h-0 w-full">
        <header className="mb-2 sm:mb-3 shrink-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Ubuntu Terminal for students
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground leading-tight">
            A GNOME Terminal replica that really runs your practicals: bash scripting, coreutils, file
            permissions, <code className="font-mono">gcc</code>, and OS process simulation (fork, zombie,
            orphan). Files you create stay cached in this browser.
          </p>
        </header>

        <TerminalWorkspace />

        <p className="mt-2 sm:mt-3 text-[11px] text-muted-foreground shrink-0 hidden sm:block">
          Need <code className="font-mono">apt</code>, <code className="font-mono">python3</code> or the real
          compiler toolchain? Run <code className="font-mono">ubuntu-vm</code>.
        </p>
      </div>
    </main>
  );
}
