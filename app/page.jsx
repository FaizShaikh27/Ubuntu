"use client";

import { useState, useMemo } from "react";
import { UbuntuTerminal } from "@/src/components/UbuntuTerminal";
import { VFS } from "@/src/lib/shell/fs.js";

export const dynamic = "force-dynamic";

/**
 * TerminalWorkspace — manages single/split terminal layout.
 *
 * Both terminals share one VFS so files created in Terminal 1 are
 * immediately visible in Terminal 2, and vice versa.
 */
function TerminalWorkspace() {
  const [split, setSplit] = useState(false);

  // Create one shared VFS instance at the workspace level.
  // useMemo with [] ensures it is only created once.
  const sharedFs = useMemo(() => new VFS(), []);

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
            onClick={() => setSplit((s) => !s)}
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
