"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runCommandLine } from "@/src/lib/shell/interpreter.js";
import { commands } from "@/src/lib/shell/commands.js";
import { createSession, displayPath } from "@/src/lib/shell/session.js";
import { NanoEditorU } from "@/src/components/NanoEditorU.jsx";

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

export function UbuntuTerminalU({ sharedFs = null, label = null, instanceId = 0, onClose = null, showClose = false }) {
  const BANNER = useMemo(() => makeBanner(instanceId), [instanceId]);

  const [blocks, setBlocks] = useState([{ kind: "out", text: BANNER }]);
  const [input, setInput] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
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

  const updateCursorPos = useCallback(() => {
    if (inputRef.current) {
      setCursorPos(inputRef.current.selectionStart ?? 0);
    }
  }, []);

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
      if (event.detail.instanceId !== undefined && event.detail.instanceId !== instanceId) return;
      setEditor({ path, text: ctx.fs.readFile(path) ?? "" });
    };
    window.addEventListener("ubuntu-terminal-edit", onEdit);
    return () => window.removeEventListener("ubuntu-terminal-edit", onEdit);
  }, [ctx, instanceId]);

  useEffect(() => {
    if (instanceId !== 0) return;
    let cancelled = false;
    fetch("/api/terminal-files")
      .then((r) => r.ok ? r.json() : null)
      .then((tree) => {
        if (cancelled || !tree) return;
        ctx.fs.mergePublic(tree, "/home/student");
        setCwdLabel(displayPath(ctx.cwd));
      })
      .catch(() => {
      });
    return () => { cancelled = true; };
  }, [ctx, instanceId, setCwdLabel]);

  const submit = useCallback(
    async (line) => {
      // The resolver is the source of truth for interactive stdin. React state
      // can lag behind when a script immediately starts its next `read`, which
      // previously caused that input to be executed as a shell command instead.
      const pendingRead = readResolver.current;
      if (pendingRead) {
        append({ kind: "out", text: line + "\n" });
        readResolver.current = null;
        setReading(false);
        setInput("");
        setCursorPos(0);
        pendingRead(line);
        return;
      }
      const path = displayPath(ctx.cwd);
      append({ kind: "prompt", path, command: line });
      setInput("");
      setCursorPos(0);
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
    [append, ctx, setCwdLabel],
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
      const newInput = parts.join(" ") + (isDir ? "/" : " ");
      setInput(newInput);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newInput.length, newInput.length);
          setCursorPos(newInput.length);
        }
      });
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
      setCursorPos(0);
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
      const val = history[next] ?? "";
      setInput(val);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(val.length, val.length);
          setCursorPos(val.length);
        }
      });
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const history = ctx.history;
      if (histIndex === null) return;
      const next = histIndex + 1;
      const val = next >= history.length ? "" : (history[next] ?? "");
      if (next >= history.length) {
        setHistIndex(null);
      } else {
        setHistIndex(next);
      }
      setInput(val);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(val.length, val.length);
          setCursorPos(val.length);
        }
      });
      return;
    }
    requestAnimationFrame(updateCursorPos);
  };

  const handleNanoSave = useCallback((savePath, saveText) => {
    ctx.fs.writeFile(savePath, saveText);
    ctx.fs.persist();
  }, [ctx]);

  const handleNanoClose = useCallback((msg) => {
    if (msg) append({ kind: "out", text: msg + "\n" });
    setEditor(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [append]);

  const titleLabel = label
    ? `${label} — student@ubuntu: ${cwdLabel}`
    : `student@ubuntu: ${cwdLabel}`;

  return (
    <div className="term-window">
      {/* ── Title bar ── */}
      <div className="term-titlebar">
        <div className="flex-center-gap-2">
          <span className="flex-gap-1-5">
            <span className="dot-red" />
            <span className="dot-yellow" />
            <span className="dot-green" />
          </span>
        </div>
        <span className="term-title-text">{titleLabel}</span>
        <div className="flex-center-gap-2">
          {showClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close terminal"
              className="term-close-btn"
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
        className="term-output"
      >
        {blocks.map((block, i) =>
          block.kind === "prompt" ? (
            <div key={i} className="whitespace-pre-wrap-break-words">
              <Prompt path={block.path} />
              {block.command}
            </div>
          ) : (
            <div
              key={i}
              className={`whitespace-pre-wrap-break-words ${block.kind === "err" ? "text-term-red" : ""}`}
            >
              {block.text}
            </div>
          ),
        )}

        {closed ? (
          <div className="text-term-dim">[Process completed — reload the page to start a new session]</div>
        ) : (
          <div className="term-input-line">
            {!busy || reading ? reading ? null : <Prompt path={cwdLabel} /> : null}
            {busy && !reading ? null : (() => {
              const safePos = Math.max(0, Math.min(cursorPos, input.length));
              const before = input.slice(0, safePos);
              const charAtCursor = input[safePos];
              const after = input.slice(safePos + 1);

              return (
                <>
                  <span>{before}</span>
                  {charAtCursor !== undefined ? (
                    <span className="term-cursor-char">
                      {charAtCursor}
                    </span>
                  ) : (
                    <span className="term-cursor-empty" />
                  )}
                  <span>{after}</span>
                </>
              );
            })()}
            <input
              type="text"
              ref={inputRef}
              value={input}
              autoFocus={instanceId === 0}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => {
                const val = e.target.value.replace(/\n/g, "");
                setInput(val);
                setCursorPos(e.target.selectionStart ?? val.length);
              }}
              onSelect={updateCursorPos}
              onKeyUp={updateCursorPos}
              onClick={updateCursorPos}
              onFocus={updateCursorPos}
              onKeyDown={onKeyDown}
              className="term-textarea"
              inputMode="text"
              aria-label={`Terminal ${instanceId + 1} input`}
            />
          </div>
        )}
      </div>

      {/* ── GNU nano editor overlay ── */}
      {editor && (
        <NanoEditorU
          path={editor.path}
          initialText={editor.text}
          onSave={handleNanoSave}
          onClose={() => handleNanoClose(null)}
          onWriteMsg={(msg) => handleNanoClose(msg)}
        />
      )}

      {/* ── Full Ubuntu VM overlay ── */}
      {vmOpen && (
        <div className="term-vm-overlay">
          <div className="term-titlebar">
            <span>Full Ubuntu machine — real bash, real gcc, apt and python3 (first boot downloads the image)</span>
            <button
              type="button"
              onClick={() => setVmOpen(false)}
              className="term-vm-back"
            >
              Back to cached terminal
            </button>
          </div>
          <iframe
            title="Full Ubuntu virtual machine"
            src="https://webvm.io/"
            className="term-vm-iframe"
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
