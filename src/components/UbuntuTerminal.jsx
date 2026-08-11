"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runCommandLine } from "@/src/lib/shell/interpreter.js";
import { commands } from "@/src/lib/shell/commands.js";
import { createSession, displayPath } from "@/src/lib/shell/session.js";
import { NanoEditor } from "@/src/components/NanoEditor.jsx";

function makeBanner(terminalId) {
  const lines = [
    "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-generic x86_64)",
    "",
    ` * Documentation:  type \`help\` to list every available command`,
    ` * Practicals:     bash scripting, coreutils and gcc all work offline`,
    ` * Storage:        files you create are cached in this browser`,
    "",
    `Last login: ${new Date().toString().replace(/GMT.*/, "")}on pts/${terminalId}`,
    "",
  ];
  return lines.join("\n");
}

/**
 * UbuntuTerminal
 *
 * Props:
 *   sharedFs   — optional VFS instance; if provided, this terminal shares
 *                the filesystem with other terminals (for split view).
 *   label      — display label shown in the title bar (e.g. "Terminal 1")
 *   instanceId — numeric ID used for the welcome banner (0 = first terminal)
 *   onClose    — callback fired when the user closes this pane (split mode)
 *   showClose  — whether to show the close (×) button
 */
export function UbuntuTerminal({ sharedFs = null, label = null, instanceId = 0, onClose = null, showClose = false }) {
  const BANNER = useMemo(() => makeBanner(instanceId), [instanceId]);

  const [blocks, setBlocks] = useState([{ kind: "out", text: BANNER }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [closed, setClosed] = useState(false);
  const [vmOpen, setVmOpen] = useState(false);
  const [editor, setEditor] = useState(null);
  const [histIndex, setHistIndex] = useState(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const readResolver = useRef(null);
  const [cwdLabel, setCwdLabel] = useState("~");

  const append = useCallback((block) => {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.kind === block.kind && block.kind !== "prompt" && last.kind !== "prompt") {
        return [...prev.slice(0, -1), { kind: last.kind, text: last.text + block.text }];
      }
      return [...prev, block];
    });
  }, []);

  const hostRef = useRef(null);

  // eslint-disable-next-line react-hooks/refs
  const [ctx] = useState(() =>
    createSession(
      {
        write: (text) => hostRef.current?.write(text),
        readLine: () => hostRef.current?.readLine(),
        clear: () => hostRef.current?.clear(),
        bootRealUbuntu: () => hostRef.current?.bootRealUbuntu(),
        exit: () => hostRef.current?.exit(),
      },
      sharedFs,
      instanceId,
    )
  );

  useEffect(() => {
    hostRef.current = {
      write: (text) => append({ kind: "out", text }),
      readLine: () =>
        new Promise((resolve) => {
          setReading(true);
          readResolver.current = resolve;
          requestAnimationFrame(() => inputRef.current?.focus());
        }),
      clear: () => setBlocks([]),
      bootRealUbuntu: () => setVmOpen(true),
      exit: () => setClosed(true),
    };
  }, [append]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [blocks, input, busy]);

  useEffect(() => {
    const onEdit = (event) => {
      const path = event.detail.path;
      // Only handle events targeted at this terminal instance
      if (event.detail.instanceId !== undefined && event.detail.instanceId !== instanceId) return;
      setEditor({ path, text: ctx.fs.readFile(path) ?? "" });
    };
    window.addEventListener("ubuntu-terminal-edit", onEdit);
    return () => window.removeEventListener("ubuntu-terminal-edit", onEdit);
  }, [ctx, instanceId]);

  // ── Fetch and merge public files from server on first load ──────────────
  // Only the first terminal instance triggers the fetch; both terminals share
  // the same VFS so the files become visible in both panes automatically.
  useEffect(() => {
    if (instanceId !== 0) return; // only fetch once across split terminals
    let cancelled = false;
    fetch("/api/terminal-files")
      .then((r) => r.ok ? r.json() : null)
      .then((tree) => {
        if (cancelled || !tree) return;
        ctx.fs.mergePublic(tree, "/home/student");
        // Trigger a re-render of the cwd label in case new files changed ls output
        setCwdLabel(displayPath(ctx.cwd));
      })
      .catch(() => {
        // Silently ignore — server may not be running or folder may not exist
      });
    return () => { cancelled = true; };
  }, [ctx, instanceId, setCwdLabel]);

  const submit = useCallback(
    async (line) => {
      if (reading && readResolver.current) {
        append({ kind: "out", text: line + "\n" });
        const resolve = readResolver.current;
        readResolver.current = null;
        setReading(false);
        setInput("");
        resolve(line);
        return;
      }
      const path = displayPath(ctx.cwd);
      append({ kind: "prompt", path, command: line });
      setInput("");
      setHistIndex(null);
      if (line.trim() === "") return;
      ctx.history.push(line);
      setBusy(true);
      await runCommandLine(line, ctx, {
        out: (text) => append({ kind: "out", text }),
        err: (text) => append({ kind: "err", text }),
      });
      ctx.fs.persist();
      setCwdLabel(displayPath(ctx.cwd));
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [append, ctx, reading, setCwdLabel],
  );

  const complete = useCallback(() => {
    const parts = input.split(/\s+/);
    const word = parts[parts.length - 1] ?? "";
    const isFirst = parts.length === 1;
    let candidates;
    if (isFirst) {
      candidates = Object.keys(commands).filter((c) => c.startsWith(word));
    } else {
      const slash = word.lastIndexOf("/");
      const dir = slash >= 0 ? word.slice(0, slash) || "/" : ".";
      const base = slash >= 0 ? word.slice(slash + 1) : word;
      const prefix = slash >= 0 ? word.slice(0, slash + 1) : "";
      candidates = ctx.fs
        .list(ctx.fs.normalize(dir, ctx.cwd))
        .filter((n) => n.startsWith(base))
        .map((n) => prefix + n);
    }
    if (candidates.length === 1) {
      parts[parts.length - 1] = candidates[0];
      const isDir = !isFirst && ctx.fs.isDir(ctx.fs.normalize(candidates[0], ctx.cwd));
      setInput(parts.join(" ") + (isDir ? "/" : " "));
    } else if (candidates.length > 1) {
      append({ kind: "prompt", path: displayPath(ctx.cwd), command: input });
      append({ kind: "out", text: candidates.join("  ") + "\n" });
    }
  }, [append, ctx, input]);

  const onKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit(input);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      complete();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "l") {
      event.preventDefault();
      setBlocks([]);
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      append({ kind: "prompt", path: displayPath(ctx.cwd), command: input + "^C" });
      setInput("");
      if (readResolver.current) {
        const resolve = readResolver.current;
        readResolver.current = null;
        setReading(false);
        resolve(null);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const history = ctx.history;
      if (!history.length) return;
      const next = histIndex === null ? history.length - 1 : Math.max(0, histIndex - 1);
      setHistIndex(next);
      setInput(history[next] ?? "");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const history = ctx.history;
      if (histIndex === null) return;
      const next = histIndex + 1;
      if (next >= history.length) {
        setHistIndex(null);
        setInput("");
      } else {
        setHistIndex(next);
        setInput(history[next] ?? "");
      }
    }
  };

  // saveEditor is now handled inside NanoEditor; this shell callback
  // is called by NanoEditor via onSave.
  const handleNanoSave = useCallback((savePath, saveText) => {
    ctx.fs.writeFile(savePath, saveText);
    ctx.fs.persist();
  }, [ctx]);

  const handleNanoClose = useCallback((msg) => {
    if (msg) append({ kind: "out", text: msg + "\n" });
    setEditor(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [append]);

  const handleHardReset = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.confirm(
        "Hard Reset will stop all running processes, erase cached memory & files, and restart the terminal. Continue?"
      )
    ) {
      window.localStorage.clear();
      window.location.reload();
    }
  }, []);

  const titleLabel = label
    ? `${label} — student@ubuntu: ${cwdLabel}`
    : `student@ubuntu: ${cwdLabel}`;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-black/40 shadow-2xl h-full">
      {/* ── Title bar ── */}
      <div className="flex items-center justify-between bg-titlebar px-3 py-2 font-sans text-sm text-titlebar-foreground flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <span className="size-3 rounded-full bg-term-red/90" />
            <span className="size-3 rounded-full bg-term-yellow/90" />
            <span className="size-3 rounded-full bg-term-green/90" />
          </span>
        </div>
        <span className="truncate font-medium">{titleLabel}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleHardReset}
            title="Stop stuck processes/infinite loops and erase memory"
            className="rounded-md border border-term-red/60 bg-term-red/20 px-2.5 py-1 text-xs font-medium text-red-200 transition-opacity hover:opacity-90 hover:bg-term-red/30 flex items-center gap-1"
          >
            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Hard Reset
          </button>
          <button
            type="button"
            onClick={() => setVmOpen(true)}
            className="rounded-md bg-orange px-2.5 py-1 text-xs font-medium text-orange-foreground transition-opacity hover:opacity-90"
          >
            Boot full Ubuntu
          </button>
          {showClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close terminal"
              className="rounded-md border border-titlebar-foreground/30 px-2 py-1 text-xs font-medium transition-opacity hover:opacity-90 hover:bg-term-red/20"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Output area ── */}
      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 min-h-0 overflow-y-auto bg-term-bg px-3 py-2 font-mono text-[14px] leading-[1.35] text-term-fg selection:bg-term-fg/25"
      >
        {blocks.map((block, i) =>
          block.kind === "prompt" ? (
            <div key={i} className="whitespace-pre-wrap break-words">
              <Prompt path={block.path} />
              {block.command}
            </div>
          ) : (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${block.kind === "err" ? "text-term-red" : ""}`}
            >
              {block.text}
            </div>
          ),
        )}

        {closed ? (
          <div className="text-term-dim">[Process completed — reload the page to start a new session]</div>
        ) : (
          <div className="flex flex-wrap items-start whitespace-pre-wrap break-words">
            {!busy || reading ? reading ? null : <Prompt path={cwdLabel} /> : null}
            {busy && !reading ? null : (
              <>
                <span>{input}</span>
                <span className="ml-px inline-block h-[1.2em] w-[0.55em] animate-pulse bg-term-fg align-middle" />
              </>
            )}
            <textarea
              ref={inputRef}
              value={input}
              autoFocus={instanceId === 0}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setInput(e.target.value.replace(/\n/g, ""))}
              onKeyDown={onKeyDown}
              className="absolute h-px w-px resize-none opacity-0"
              aria-label={`Terminal ${instanceId + 1} input`}
            />
          </div>
        )}
      </div>

      {/* ── GNU nano editor overlay ── */}
      {editor && (
        <NanoEditor
          path={editor.path}
          initialText={editor.text}
          onSave={handleNanoSave}
          onClose={() => handleNanoClose(null)}
          onWriteMsg={(msg) => handleNanoClose(msg)}
        />
      )}

      {/* ── Full Ubuntu VM overlay ── */}
      {vmOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-titlebar">
          <div className="flex items-center justify-between px-3 py-2 font-sans text-sm text-titlebar-foreground">
            <span>Full Ubuntu machine — real bash, real gcc, apt and python3 (first boot downloads the image)</span>
            <button
              type="button"
              onClick={() => setVmOpen(false)}
              className="rounded-md border border-titlebar-foreground/30 px-3 py-1"
            >
              Back to cached terminal
            </button>
          </div>
          <iframe
            title="Full Ubuntu virtual machine"
            src="https://webvm.io/"
            className="h-full w-full flex-1 border-0 bg-term-bg"
          />
        </div>
      )}
    </div>
  );
}

function Prompt({ path }) {
  return (
    <span>
      <span className="font-bold text-term-green">student@ubuntu</span>
      <span className="text-term-fg">:</span>
      <span className="font-bold text-term-blue">{path}</span>
      <span className="text-term-fg">$ </span>
    </span>
  );
}
