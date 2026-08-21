"use client";

import { useState, useMemo } from "react";
import { UbuntuTerminalU } from "@/src/components/UbuntuTerminalU";
import { VFS } from "@/src/lib/shell/fs.js";

import "./u.css";

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
    <div className="workspace-wrapper">
      {/* ── Toolbar ── */}
      <div className="workspace-toolbar">
        <p className="text-small-muted">
          {split
            ? "Split view — both terminals share the same filesystem."
            : "Single terminal — click Split to open a second terminal side-by-side."}
        </p>
        <div className="flex-center-gap-2">
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
            className="btn-hard-reset"
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
            className={`btn-split ${split ? "btn-split-active" : "btn-split-inactive"}`}
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
        className={`terminal-grid ${split ? "md-grid-cols-2" : "grid-cols-1"}`}
      >
        {/* Terminal 1 — always visible */}
        <div className="terminal-container">
          <UbuntuTerminalU
            sharedFs={sharedFs}
            label={split ? "Terminal 1" : null}
            instanceId={0}
            showClose={false}
          />
        </div>

        {/* Terminal 2 — only in split mode */}
        {split && (
          <div className="terminal-container">
            <UbuntuTerminalU
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
      <section className="features-section">
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
          <article key={card.title} className="feature-card">
            <h2 className="card-title">{card.title}</h2>
            <p className="card-body">{card.body}</p>
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

export default function HomeU() {
  return (
    <main className="page-main">
      <div className="page-content">
        <header className="page-header">
          <h1 className="page-title">
            Ubuntu Terminal for students
          </h1>
          <p className="page-description">
            A GNOME Terminal replica that really runs your practicals: bash scripting, coreutils, file
            permissions, <code className="font-mono">gcc</code>, and OS process simulation (fork, zombie,
            orphan). Files you create stay cached in this browser.
          </p>
        </header>

        <TerminalWorkspace />

        <p className="page-footer">
          Need <code className="font-mono">apt</code>, <code className="font-mono">python3</code> or the real
          compiler toolchain? Run <code className="font-mono">ubuntu-vm</code>.
        </p>
      </div>
    </main>
  );
}
