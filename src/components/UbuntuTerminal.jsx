"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runCommandLine } from "@/src/lib/shell/interpreter.js";
import { commands } from "@/src/lib/shell/commands.js";
import { createSession, displayPath } from "@/src/lib/shell/session.js";

const BANNER = [
  "Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-generic x86_64)",
  "",
  " * Documentation:  type `help` to list every available command",
  " * Practicals:     bash scripting, coreutils and gcc all work offline",
  " * Storage:        files you create are cached in this browser",
  "",
  "Last login: " + new Date().toString().replace(/GMT.*/, "") + "on pts/0",
  "",
].join("\n");

export function UbuntuTerminal() {
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
  const ctxRef = useRef(null);
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

  const ctx = useMemo(() => {
    if (ctxRef.current) return ctxRef.current;
    const session = createSession({
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
    });
    ctxRef.current = session;
    return session;
  }, [append]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [blocks, input, busy]);

  useEffect(() => {
    const onEdit = (event) => {
      const path = event.detail.path;
      setEditor({ path, text: ctx.fs.readFile(path) ?? "" });
    };
    window.addEventListener("ubuntu-terminal-edit", onEdit);
    return () => window.removeEventListener("ubuntu-terminal-edit", onEdit);
  }, [ctx]);

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
    [append, ctx, reading],
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

  const saveEditor = () => {
    if (!editor) return;
    ctx.fs.writeFile(editor.path, editor.text);
    append({ kind: "out", text: `[ Wrote ${editor.text.split("\n").length} lines to ${editor.path} ]\n` });
    setEditor(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className="overflow-hidden rounded-xl border border-black/40 shadow-2xl">
      <div className="flex items-center justify-between bg-titlebar px-3 py-2 font-sans text-sm text-titlebar-foreground">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <span className="size-3 rounded-full bg-term-red/90" />
            <span className="size-3 rounded-full bg-term-yellow/90" />
            <span className="size-3 rounded-full bg-term-green/90" />
          </span>
        </div>
        <span className="truncate font-medium">student@ubuntu: {cwdLabel}</span>
        <button
          type="button"
          onClick={() => setVmOpen(true)}
          className="rounded-md bg-orange px-2.5 py-1 text-xs font-medium text-orange-foreground transition-opacity hover:opacity-90"
        >
          Boot full Ubuntu
        </button>
      </div>

      <div
        ref={scrollRef}
        onClick={() => inputRef.current?.focus()}
        className="h-[70vh] min-h-[420px] overflow-y-auto bg-term-bg px-3 py-2 font-mono text-[15px] leading-[1.35] text-term-fg selection:bg-term-fg/25"
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
              autoFocus
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setInput(e.target.value.replace(/\n/g, ""))}
              onKeyDown={onKeyDown}
              className="absolute h-px w-px resize-none opacity-0"
              aria-label="Terminal input"
            />
          </div>
        )}
      </div>

      {editor && (
        <div className="fixed inset-0 z-50 flex flex-col bg-term-bg/95 p-4 font-mono text-term-fg backdrop-blur">
          <div className="mb-2 flex items-center justify-between font-sans text-sm">
            <span>GNU nano — {editor.path}</span>
            <span className="text-term-dim">Ctrl+S / Save · Esc / Exit</span>
          </div>
          <textarea
            autoFocus
            value={editor.text}
            onChange={(e) => setEditor({ ...editor, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.ctrlKey && e.key.toLowerCase() === "s") { e.preventDefault(); saveEditor(); }
              if (e.key === "Escape") setEditor(null);
            }}
            className="flex-1 resize-none rounded-md border border-term-fg/20 bg-term-bg p-3 text-[15px] outline-none"
            spellCheck={false}
          />
          <div className="mt-2 flex gap-2 font-sans text-sm">
            <button type="button" onClick={saveEditor} className="rounded-md bg-orange px-3 py-1.5 text-orange-foreground">
              Save (Ctrl+S)
            </button>
            <button type="button" onClick={() => setEditor(null)} className="rounded-md border border-term-fg/30 px-3 py-1.5">
              Close
            </button>
          </div>
        </div>
      )}

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
