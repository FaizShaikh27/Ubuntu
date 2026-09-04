"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * NanoEditorU — a faithful replica of GNU nano's interface without Tailwind CSS.
 */
export function NanoEditorU({ path, initialText, onSave, onClose, onWriteMsg }) {
  const filename = path.split("/").pop() ?? path;

  // ── editor state ──────────────────────────────────────────────────────────
  const [text, setText]           = useState(initialText ?? "");
  const [savedText, setSavedText] = useState(initialText ?? "");
  const [statusMsg, setStatusMsg] = useState("");        // one-line status bar
  const [mode, setMode]           = useState("edit");    // 'edit' | 'write-out' | 'exit-confirm' | 'find' | 'replace'
  const [promptValue, setPromptValue] = useState("");    // content of bottom prompt input
  const [findTerm, setFindTerm]   = useState("");        // last used search term
  const [cutBuffer, setCutBuffer] = useState("");        // Ctrl+K / Ctrl+U buffer

  const textareaRef  = useRef(null);
  const promptRef    = useRef(null);
  const statusTimer  = useRef(null);

  const isModified = text !== savedText;

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Show a temporary message in the status bar (clears after 3 s). */
  const flash = useCallback((msg) => {
    setStatusMsg(msg);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatusMsg(""), 3000);
  }, []);

  /** Perform the actual save operation. */
  const doSave = useCallback((savePath, saveText) => {
    onSave(savePath, saveText);
    setSavedText(saveText);
    const lineCount = saveText.split("\n").length;
    flash(`Wrote ${lineCount} line${lineCount !== 1 ? "s" : ""}`);
  }, [onSave, flash]);

  /** Focus the main textarea (deferred so React has painted). */
  const focusTextarea = useCallback(() => {
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  // Focus nano immediately when it opens, then move focus between the editor
  // and nano's prompts without requiring an extra click.
  useEffect(() => {
    const target = mode === "edit" ? textareaRef : promptRef;
    const focusTarget = () => target.current?.focus({ preventScroll: true });
    requestAnimationFrame(focusTarget);
    window.addEventListener("focus", focusTarget);
    return () => window.removeEventListener("focus", focusTarget);
  }, [mode]);

  // ── Ctrl+K: cut current line ───────────────────────────────────────────────
  const cutLine = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const val   = ta.value;
    const start = ta.selectionStart;
    // find start / end of the current line
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    let   lineEnd   = val.indexOf("\n", start);
    if (lineEnd === -1) lineEnd = val.length;
    else lineEnd += 1; // include the \n
    const cut    = val.slice(lineStart, lineEnd);
    const newVal = val.slice(0, lineStart) + val.slice(lineEnd);
    setText(newVal);
    setCutBuffer((prev) => prev + cut);
    flash("1 line cut");
    // restore caret
    requestAnimationFrame(() => {
      ta.setSelectionRange(lineStart, lineStart);
      ta.focus();
    });
  }, [flash]);

  // ── Ctrl+U: uncut (paste) ─────────────────────────────────────────────────
  const uncutLine = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || !cutBuffer) return;
    const val     = ta.value;
    const pos     = ta.selectionStart;
    const newVal  = val.slice(0, pos) + cutBuffer + val.slice(pos);
    setText(newVal);
    setCutBuffer("");
    flash("Text uncut from cut buffer");
    requestAnimationFrame(() => {
      ta.setSelectionRange(pos + cutBuffer.length, pos + cutBuffer.length);
      ta.focus();
    });
  }, [cutBuffer, flash]);

  // ── Ctrl+W: find ──────────────────────────────────────────────────────────
  const openFind = useCallback(() => {
    setPromptValue(findTerm);
    setMode("find");
  }, [findTerm]);

  const execFind = useCallback((term) => {
    const ta = textareaRef.current;
    if (!ta || !term) { flash("Cancelled"); setMode("edit"); focusTextarea(); return; }
    const val   = ta.value;
    const start = ta.selectionStart + 1;
    let   idx   = val.indexOf(term, start);
    if (idx === -1) idx = val.indexOf(term, 0); // wrap
    if (idx === -1) { flash(`"${term}": not found`); setMode("edit"); focusTextarea(); return; }
    setFindTerm(term);
    setMode("edit");
    focusTextarea();
    requestAnimationFrame(() => {
      ta.setSelectionRange(idx, idx + term.length);
      ta.focus();
    });
    flash(`"${term}" found`);
  }, [flash, focusTextarea]);

  // ── Ctrl+O: write-out ─────────────────────────────────────────────────────
  const openWriteOut = useCallback(() => {
    setPromptValue(path); // pre-fill with current path
    setMode("write-out");
  }, [path]);

  const execWriteOut = useCallback((savePath, saveText) => {
    doSave(savePath, saveText);
    setMode("edit");
    focusTextarea();
  }, [doSave, focusTextarea]);

  // ── Ctrl+X: exit ──────────────────────────────────────────────────────────
  const tryExit = useCallback(() => {
    if (!isModified) {
      onClose();
    } else {
      setMode("exit-confirm");
    }
  }, [isModified, onClose]);

  // ── cursor position (Ctrl+C) ──────────────────────────────────────────────
  const showCurPos = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const val  = ta.value;
    const pos  = ta.selectionStart;
    const line = (val.slice(0, pos).match(/\n/g) ?? []).length + 1;
    const col  = pos - val.lastIndexOf("\n", pos - 1);
    const pct  = val.length ? Math.round((pos / val.length) * 100) : 0;
    flash(`line ${line}/${val.split("\n").length}, col ${col}/${val.split("\n")[line - 1]?.length ?? 0}, char ${pos}/${val.length} (${pct}%)`);
  }, [flash]);

  // ── main textarea key handler ─────────────────────────────────────────────
  const onKeyDownTextarea = useCallback((e) => {
    if (!e.ctrlKey) return;
    const key = e.key.toLowerCase();
    switch (key) {
      case "o": e.preventDefault(); openWriteOut(); break;
      case "x": e.preventDefault(); tryExit(); break;
      case "k": e.preventDefault(); cutLine(); break;
      case "u": e.preventDefault(); uncutLine(); break;
      case "w": e.preventDefault(); openFind(); break;
      case "c": e.preventDefault(); showCurPos(); break;
      case "g":
        e.preventDefault();
        flash("^O Write Out  ^X Exit  ^K Cut  ^U Paste  ^W Find  ^C Pos");
        break;
      case "\\":
      case "h": e.preventDefault(); openFind(); break; // simple replace via find
      default: break;
    }
  }, [openWriteOut, tryExit, cutLine, uncutLine, openFind, showCurPos, flash]);

  // ── prompt key handler ────────────────────────────────────────────────────
  const onKeyDownPrompt = useCallback((e) => {
    // ── exit-confirm mode: single key Y / N / ^C ──────────────────────────
    if (mode === "exit-confirm") {
      e.preventDefault();
      if (e.ctrlKey && e.key.toLowerCase() === "c") {
        flash("Cancelled");
        setMode("edit");
        focusTextarea();
        return;
      }
      const k = e.key.toUpperCase();
      if (k === "Y") {
        doSave(path, text);
        if (onWriteMsg) onWriteMsg(`[ Wrote ${text.split("\n").length} lines to ${path} ]`);
        onClose();
      } else if (k === "N") {
        onClose();
      }
      // any other key is ignored in exit-confirm mode
      return;
    }

    // ── write-out / find: Enter to confirm ───────────────────────────────
    if (e.key === "Enter") {
      e.preventDefault();
      if (mode === "write-out") {
        execWriteOut(promptValue || path, text);
      } else if (mode === "find") {
        execFind(promptValue);
      }
      return;
    }

    // ── Ctrl+C or Escape: cancel the current prompt ───────────────────────
    if (e.key === "Escape" || (e.ctrlKey && e.key.toLowerCase() === "c")) {
      e.preventDefault();
      flash("Cancelled");
      setMode("edit");
      focusTextarea();
    }
  }, [mode, execWriteOut, execFind, promptValue, path, text, doSave, onClose, onWriteMsg, flash, focusTextarea]);

  // ── derived UI values ─────────────────────────────────────────────────────

  // Top bar: center title like real nano
  const lineCount   = text.split("\n").length;
  const modifiedTag = isModified ? " Modified" : "";
  const topTitle    = `GNU nano 6.2         ${filename}${modifiedTag}`;

  // Bottom status / prompt area
  let promptLabel = "";
  let promptPlaceholder = "";
  let showPromptInput = false;
  let exitConfirmText = null;

  if (mode === "write-out") {
    promptLabel      = "File Name to Write: ";
    promptPlaceholder = path;
    showPromptInput  = true;
  } else if (mode === "find") {
    promptLabel      = "Search: ";
    promptPlaceholder = findTerm || "";
    showPromptInput  = true;
  } else if (mode === "exit-confirm") {
    exitConfirmText = "Save modified buffer?";
    showPromptInput = true; // captures Y/N via hidden input
    promptLabel = "";
  }

  // Shortcut bar — two rows, like real nano
  const shortcuts = [
    [
      ["^G", "Help"],
      ["^O", "Write Out"],
      ["^W", "Where Is"],
      ["^K", "Cut"],
      ["^J", "Justify"],
      ["^C", "Cur Pos"],
    ],
    [
      ["^X", "Exit"],
      ["^R", "Read File"],
      ["^\\", "Replace"],
      ["^U", "Paste"],
      ["^T", "To Spell"],
      ["^/", "Go To Line"],
    ],
  ];

  return (
    <div
      className="nano-overlay"
      style={{ background: "var(--term-bg)", color: "var(--term-fg)" }}
    >
      {/* ── Top title bar ── */}
      <div
        className="nano-topbar"
        style={{ background: "var(--titlebar)", color: "var(--titlebar-foreground)" }}
      >
        {topTitle}
      </div>

      {/* ── Main editing area ── */}
      <textarea
        ref={textareaRef}
        value={text}
        autoFocus
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDownTextarea}
        className="nano-textarea"
        style={{ background: "var(--term-bg)", color: "var(--term-fg)", caretColor: "var(--term-fg)" }}
        aria-label="nano editor content"
      />

      {/* ── Status / prompt row ── */}
      <div
        className="nano-statusbar"
        style={{ background: "var(--titlebar)", color: "var(--titlebar-foreground)" }}
      >
        {mode === "exit-confirm" ? (
          <div className="flex-center-gap-3">
            <span className="font-bold">Save modified buffer?</span>
            <span className="opacity-80">(Answering 'No' will DISCARD changes.)</span>
            <span className="ml-auto-flex-gap-4">
              <span><span className="font-bold">Y</span> Yes</span>
              <span><span className="font-bold">N</span> No</span>
              <span><span className="font-bold">^C</span> Cancel</span>
            </span>
            {/* Hidden input captures keystrokes for Y/N/^C */}
            <input
              ref={promptRef}
              value=""
              readOnly
              onChange={() => {}}
              onKeyDown={onKeyDownPrompt}
              className="nano-hidden-input"
              aria-label="exit confirm input"
            />
          </div>
        ) : showPromptInput ? (
          <div className="flex-center-gap-1">
            <span className="whitespace-nowrap">{promptLabel}</span>
            <input
              ref={promptRef}
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={onKeyDownPrompt}
              className="nano-prompt-input"
              style={{ color: "var(--titlebar-foreground)", caretColor: "var(--titlebar-foreground)" }}
              spellCheck={false}
              autoComplete="off"
              aria-label="nano prompt input"
            />
          </div>
        ) : (
          <span className={statusMsg ? "font-medium" : "opacity-0"}>{statusMsg || "."}</span>
        )}
      </div>

      {/* ── Shortcut bar — two rows ── */}
      {shortcuts.map((row, ri) => (
        <div
          key={ri}
          className="nano-shortcut-row"
          style={{ background: "var(--titlebar)", borderTop: ri === 0 ? "1px solid rgba(255,255,255,0.08)" : undefined }}
        >
          {row.map(([key, label]) => (
            <div key={key} className="nano-shortcut-item">
              <span
                className="nano-shortcut-key"
                style={{ background: "var(--term-fg)", color: "var(--term-bg)" }}
              >
                {key}
              </span>
              <span className="nano-shortcut-label" style={{ color: "var(--titlebar-foreground)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
