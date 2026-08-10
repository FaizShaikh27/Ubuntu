import { HOME } from "./fs";
import type { CmdIO, ShellCtx } from "./types";
import { commands } from "./commands";
import { runExecutable } from "./exec";

/* ------------------------------------------------------------------ */
/* Lexer                                                               */
/* ------------------------------------------------------------------ */

type Token = { type: "word" | "op" | "nl"; value: string };

const OPERATORS = ["&&", "||", ";;", ">>", "2>>", "2>", "&>", "<<<", "<<", "|", ";", "&", "<", ">", "(", ")"];

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let cur = "";
  const push = () => {
    if (cur !== "") {
      tokens.push({ type: "word", value: cur });
      cur = "";
    }
  };
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === "\\") {
      cur += ch + (input[i + 1] ?? "");
      i += 2;
      continue;
    }
    if (ch === "#" && cur === "" && (i === 0 || /\s/.test(input[i - 1] ?? " "))) {
      while (i < input.length && input[i] !== "\n") i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      cur += ch;
      i++;
      while (i < input.length && input[i] !== quote) {
        if (quote === '"' && input[i] === "\\") {
          cur += input[i]! + (input[i + 1] ?? "");
          i += 2;
          continue;
        }
        cur += input[i]!;
        i++;
      }
      cur += quote;
      i++;
      continue;
    }
    if (ch === "$" && input[i + 1] === "(") {
      let depth = 0;
      const start = i;
      i += 1;
      while (i < input.length) {
        if (input[i] === "(") depth++;
        else if (input[i] === ")") {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        i++;
      }
      cur += input.slice(start, i);
      continue;
    }
    if (ch === "`") {
      const start = i;
      i++;
      while (i < input.length && input[i] !== "`") i++;
      i++;
      cur += input.slice(start, i);
      continue;
    }
    if (ch === "\n") {
      push();
      tokens.push({ type: "nl", value: "\n" });
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      push();
      i++;
      continue;
    }
    // `((` and `))` as single operators for arithmetic constructs
    if (input.startsWith("((", i) && cur === "") {
      push();
      tokens.push({ type: "op", value: "((" });
      i += 2;
      continue;
    }
    if (input.startsWith("))", i)) {
      push();
      tokens.push({ type: "op", value: "))" });
      i += 2;
      continue;
    }
    const op = OPERATORS.find((o) => input.startsWith(o, i));
    if (op) {
      // digits directly before > belong to the redirection (e.g. 2>)
      push();
      tokens.push({ type: "op", value: op });
      i += op.length;
      continue;
    }
    cur += ch;
    i++;
  }
  push();
  return tokens;
}

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

type Redir = { op: ">" | ">>" | "<" | "2>" | "2>>" | "&>" | "<<<"; target: string };
type Simple = { kind: "simple"; words: string[]; redirs: Redir[] };
type Pipeline = { kind: "pipeline"; cmds: Node[]; redirs: Redir[] };

export type Node =
  | Simple
  | Pipeline
  | { kind: "and"; left: Node; right: Node }
  | { kind: "or"; left: Node; right: Node }
  | { kind: "seq"; items: Node[] }
  | { kind: "if"; branches: { cond: Node; body: Node }[]; otherwise?: Node }
  | { kind: "for"; name: string; items: string[]; body: Node }
  | { kind: "cfor"; init: string; cond: string; step: string; body: Node }
  | { kind: "while"; cond: Node; body: Node; until: boolean }
  | { kind: "case"; word: string; cases: { patterns: string[]; body: Node }[] }
  | { kind: "func"; name: string; body: Node }
  | { kind: "group"; body: Node }
  | { kind: "arith"; expr: string };

const RESERVED = new Set([
  "if", "then", "elif", "else", "fi", "for", "in", "do", "done", "while", "until", "case", "esac", "function", "{", "}",
]);

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private skipNl() {
    while (this.peek() && (this.peek()!.type === "nl" || this.peek()!.value === ";")) this.pos++;
  }
  private at(value: string): boolean {
    const t = this.peek();
    return !!t && t.value === value && t.type !== "nl";
  }
  private eat(value: string): boolean {
    if (this.at(value)) {
      this.pos++;
      return true;
    }
    return false;
  }
  private expect(value: string) {
    if (!this.eat(value)) throw new Error(`syntax error near unexpected token \`${this.peek()?.value ?? "newline"}'`);
  }

  parseScript(stop: string[] = []): Node {
    const items: Node[] = [];
    for (;;) {
      this.skipNl();
      const t = this.peek();
      if (!t) break;
      if (stop.includes(t.value)) break;
      items.push(this.parseAndOr());
      const next = this.peek();
      if (next && (next.type === "nl" || next.value === ";" || next.value === "&")) this.pos++;
      else if (!next || stop.includes(next.value)) break;
    }
    if (items.length === 1) return items[0]!;
    return { kind: "seq", items };
  }

  private parseAndOr(): Node {
    let left = this.parsePipeline();
    for (;;) {
      if (this.eat("&&")) {
        this.skipNl();
        left = { kind: "and", left, right: this.parsePipeline() };
      } else if (this.eat("||")) {
        this.skipNl();
        left = { kind: "or", left, right: this.parsePipeline() };
      } else break;
    }
    return left;
  }

  private parsePipeline(): Node {
    const cmds: Node[] = [this.parseCommand()];
    while (this.eat("|")) {
      this.skipNl();
      cmds.push(this.parseCommand());
    }
    if (cmds.length === 1) return cmds[0]!;
    return { kind: "pipeline", cmds, redirs: [] };
  }

  private parseRedirs(redirs: Redir[]): boolean {
    const t = this.peek();
    if (!t || t.type !== "op") return false;
    if ([">", ">>", "<", "2>", "2>>", "&>", "<<<"].includes(t.value)) {
      this.pos++;
      const target = this.peek();
      if (!target || target.type !== "word") throw new Error("syntax error near unexpected token `newline'");
      this.pos++;
      redirs.push({ op: t.value as Redir["op"], target: target.value });
      return true;
    }
    return false;
  }

  private parseCommand(): Node {
    this.skipNlOnly();
    const t = this.peek();
    if (!t) return { kind: "simple", words: [], redirs: [] };

    if (t.value === "if") return this.parseIf();
    if (t.value === "for") return this.parseFor();
    if (t.value === "while" || t.value === "until") return this.parseWhile(t.value === "until");
    if (t.value === "case") return this.parseCase();
    if (t.value === "{") {
      this.pos++;
      const body = this.parseScript(["}"]);
      this.expect("}");
      return { kind: "group", body };
    }
    if (t.value === "((") {
      this.pos++;
      const expr = this.collectUntil("))");
      return { kind: "arith", expr };
    }
    if (t.value === "function") {
      this.pos++;
      const name = this.peek()!.value;
      this.pos++;
      this.eat("(");
      this.eat(")");
      this.skipNl();
      this.expect("{");
      const body = this.parseScript(["}"]);
      this.expect("}");
      return { kind: "func", name, body };
    }
    // function name() { ... }
    if (
      t.type === "word" &&
      this.tokens[this.pos + 1]?.value === "(" &&
      this.tokens[this.pos + 2]?.value === ")"
    ) {
      const name = t.value;
      this.pos += 3;
      this.skipNl();
      this.expect("{");
      const body = this.parseScript(["}"]);
      this.expect("}");
      return { kind: "func", name, body };
    }

    const words: string[] = [];
    const redirs: Redir[] = [];
    for (;;) {
      if (this.parseRedirs(redirs)) continue;
      const tok = this.peek();
      if (!tok || tok.type === "nl") break;
      if (tok.type === "op") break;
      if (words.length > 0 && RESERVED.has(tok.value) && tok.value !== "in") break;
      words.push(tok.value);
      this.pos++;
    }
    return { kind: "simple", words, redirs };
  }

  private skipNlOnly() {
    while (this.peek()?.type === "nl") this.pos++;
  }

  private collectUntil(stop: string): string {
    const parts: string[] = [];
    while (this.peek() && this.peek()!.value !== stop) {
      parts.push(this.peek()!.value);
      this.pos++;
    }
    this.expect(stop);
    return parts.join(" ");
  }

  private parseIf(): Node {
    this.expect("if");
    const branches: { cond: Node; body: Node }[] = [];
    const cond = this.parseScript(["then"]);
    this.expect("then");
    const body = this.parseScript(["elif", "else", "fi"]);
    branches.push({ cond, body });
    let otherwise: Node | undefined;
    for (;;) {
      if (this.eat("elif")) {
        const c = this.parseScript(["then"]);
        this.expect("then");
        const b = this.parseScript(["elif", "else", "fi"]);
        branches.push({ cond: c, body: b });
        continue;
      }
      if (this.eat("else")) {
        otherwise = this.parseScript(["fi"]);
      }
      break;
    }
    this.expect("fi");
    return otherwise ? { kind: "if", branches, otherwise } : { kind: "if", branches };
  }

  private parseFor(): Node {
    this.expect("for");
    if (this.at("((")) {
      this.pos++;
      const inner = this.collectUntil("))");
      const [init = "", cond = "", step = ""] = inner.split(";").map((s) => s.trim());
      this.skipNl();
      this.eat(";");
      this.skipNl();
      this.expect("do");
      const body = this.parseScript(["done"]);
      this.expect("done");
      return { kind: "cfor", init, cond, step, body };
    }
    const name = this.peek()!.value;
    this.pos++;
    const items: string[] = [];
    if (this.eat("in")) {
      for (;;) {
        const tok = this.peek();
        if (!tok || tok.type === "nl" || tok.value === ";" || tok.value === "do") break;
        items.push(tok.value);
        this.pos++;
      }
    } else {
      items.push('"$@"');
    }
    this.skipNl();
    this.eat(";");
    this.skipNl();
    this.expect("do");
    const body = this.parseScript(["done"]);
    this.expect("done");
    return { kind: "for", name, items, body };
  }

  private parseWhile(until: boolean): Node {
    this.pos++;
    const cond = this.parseScript(["do"]);
    this.expect("do");
    const body = this.parseScript(["done"]);
    this.expect("done");
    return { kind: "while", cond, body, until };
  }

  private parseCase(): Node {
    this.expect("case");
    const word = this.peek()!.value;
    this.pos++;
    this.expect("in");
    const cases: { patterns: string[]; body: Node }[] = [];
    for (;;) {
      this.skipNl();
      if (this.at("esac") || !this.peek()) break;
      const patterns: string[] = [];
      this.eat("(");
      for (;;) {
        const tok = this.peek();
        if (!tok) break;
        if (tok.value === ")") {
          this.pos++;
          break;
        }
        if (tok.value === "|") {
          this.pos++;
          continue;
        }
        patterns.push(tok.value);
        this.pos++;
      }
      const body = this.parseScript([";;", "esac"]);
      this.eat(";;");
      cases.push({ patterns, body });
    }
    this.expect("esac");
    return { kind: "case", word, cases };
  }
}

export function parse(input: string): Node {
  return new Parser(tokenize(input)).parseScript();
}

/* ------------------------------------------------------------------ */
/* Expansion                                                           */
/* ------------------------------------------------------------------ */

export class BreakSignal {
  constructor(public levels = 1) {}
}
export class ContinueSignal {
  constructor(public levels = 1) {}
}
export class ReturnSignal {
  constructor(public code = 0) {}
}

function isNum(s: string) {
  return /^-?\d+(\.\d+)?$/.test(s.trim());
}

export function evalArith(expr: string, ctx: ShellCtx): number {
  const src = expr.trim();
  // handle assignment forms: x = e, x += e, x++, ++x
  let m = /^([A-Za-z_]\w*)\s*(\+\+|--)$/.exec(src);
  if (m) {
    const v = Number(ctx.vars[m[1]!] ?? 0) || 0;
    ctx.vars[m[1]!] = String(m[2] === "++" ? v + 1 : v - 1);
    return v;
  }
  m = /^(\+\+|--)\s*([A-Za-z_]\w*)$/.exec(src);
  if (m) {
    const v = (Number(ctx.vars[m[2]!] ?? 0) || 0) + (m[1] === "++" ? 1 : -1);
    ctx.vars[m[2]!] = String(v);
    return v;
  }
  m = /^([A-Za-z_]\w*)\s*(=|\+=|-=|\*=|\/=|%=)\s*([\s\S]+)$/.exec(src);
  if (m) {
    const cur = Number(ctx.vars[m[1]!] ?? 0) || 0;
    const rhs = evalArith(m[3]!, ctx);
    const map: Record<string, number> = {
      "=": rhs,
      "+=": cur + rhs,
      "-=": cur - rhs,
      "*=": cur * rhs,
      "/=": rhs === 0 ? 0 : Math.trunc(cur / rhs),
      "%=": rhs === 0 ? 0 : cur % rhs,
    };
    const val = map[m[2]!]!;
    ctx.vars[m[1]!] = String(val);
    return val;
  }
  if (src.includes(",")) {
    let last = 0;
    for (const part of src.split(",")) last = evalArith(part, ctx);
    return last;
  }
  const replaced = src.replace(/\$?\b([A-Za-z_]\w*)\b/g, (whole, name: string) => {
    const v = ctx.vars[name];
    return v !== undefined && isNum(v) ? v : v !== undefined ? "0" : "0";
  });
  if (!/^[0-9+\-*/%()<>=!&| .]*$/.test(replaced)) return 0;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${replaced || 0});`)() as number | boolean;
    const num = typeof result === "boolean" ? (result ? 1 : 0) : result;
    return Number.isFinite(num) ? Math.trunc(num) : 0;
  } catch {
    return 0;
  }
}

function globToRegex(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else if (c === "[") {
      let j = i + 1;
      let cls = "";
      if (pattern[j] === "!") {
        cls += "^";
        j++;
      }
      while (j < pattern.length && pattern[j] !== "]") {
        cls += pattern[j];
        j++;
      }
      out += "[" + cls + "]";
      i = j;
    } else out += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(out + "$");
}

export function matchGlob(pattern: string, value: string): boolean {
  return globToRegex(pattern).test(value);
}

async function expandCommandSub(body: string, ctx: ShellCtx): Promise<string> {
  const buf: string[] = [];
  const sub: ShellCtx = { ...ctx, host: { ...ctx.host, write: (t) => buf.push(t) } };
  await execNode(parse(body), sub, { out: (t) => buf.push(t), err: (t) => buf.push(t) });
  ctx.status = sub.status;
  ctx.cwd = sub.cwd;
  return buf.join("").replace(/\n+$/, "");
}

/** Expand one raw word into zero or more fields. */
export async function expandWord(raw: string, ctx: ShellCtx): Promise<string[]> {
  let result = "";
  let quotedAnywhere = false;
  let i = 0;

  const readVar = (): string => {
    // assumes raw[i] === '$'
    i++;
    if (raw[i] === "{") {
      let depth = 1;
      let j = i + 1;
      let inner = "";
      while (j < raw.length && depth > 0) {
        if (raw[j] === "{") depth++;
        if (raw[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
        inner += raw[j];
        j++;
      }
      i = j + 1;
      return expandParam(inner, ctx);
    }
    if (raw[i] === "?") {
      i++;
      return String(ctx.status);
    }
    if (raw[i] === "$") {
      i++;
      return "4242";
    }
    if (raw[i] === "#") {
      i++;
      return ctx.vars["#"] ?? "0";
    }
    if (raw[i] === "@" || raw[i] === "*") {
      i++;
      return ctx.vars["@"] ?? "";
    }
    let name = "";
    while (i < raw.length && /[A-Za-z0-9_]/.test(raw[i]!)) {
      name += raw[i];
      i++;
    }
    if (name === "") return "$";
    return ctx.vars[name] ?? "";
  };

  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === "\\") {
      result += raw[i + 1] ?? "";
      i += 2;
      continue;
    }
    if (ch === "'") {
      quotedAnywhere = true;
      i++;
      while (i < raw.length && raw[i] !== "'") {
        result += raw[i];
        i++;
      }
      i++;
      continue;
    }
    if (ch === '"') {
      quotedAnywhere = true;
      i++;
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === "\\") {
          const n = raw[i + 1] ?? "";
          result += '"$`\\'.includes(n) ? n : "\\" + n;
          i += 2;
          continue;
        }
        if (raw[i] === "$" && raw[i + 1] === "(") {
          const { body, next } = readParens(raw, i + 1);
          result += await expandCommandSub(body, ctx);
          i = next;
          continue;
        }
        if (raw[i] === "$") {
          result += readVar();
          continue;
        }
        result += raw[i];
        i++;
      }
      i++;
      continue;
    }
    if (ch === "$" && raw[i + 1] === "(" && raw[i + 2] === "(") {
      const { body, next } = readParens(raw, i + 1);
      result += String(evalArith(body.replace(/^\(|\)$/g, ""), ctx));
      i = next;
      continue;
    }
    if (ch === "$" && raw[i + 1] === "(") {
      const { body, next } = readParens(raw, i + 1);
      result += await expandCommandSub(body, ctx);
      i = next;
      continue;
    }
    if (ch === "`") {
      let j = i + 1;
      let body = "";
      while (j < raw.length && raw[j] !== "`") {
        body += raw[j];
        j++;
      }
      result += await expandCommandSub(body, ctx);
      i = j + 1;
      continue;
    }
    if (ch === "$") {
      result += readVar();
      continue;
    }
    if (ch === "~" && i === 0 && (raw[1] === "/" || raw.length === 1)) {
      result += ctx.vars["HOME"] ?? HOME;
      i++;
      continue;
    }
    result += ch;
    i++;
  }

  if (quotedAnywhere) return [result];

  const fields = result.split(/\s+/).filter((f) => f !== "");
  const out: string[] = [];
  for (const field of fields.length ? fields : []) {
    out.push(...globExpand(field, ctx));
  }
  return out;
}

function readParens(raw: string, start: number): { body: string; next: number } {
  let depth = 0;
  let j = start;
  let body = "";
  for (; j < raw.length; j++) {
    const c = raw[j]!;
    if (c === "(") {
      depth++;
      if (depth === 1) continue;
    }
    if (c === ")") {
      depth--;
      if (depth === 0) {
        j++;
        break;
      }
    }
    body += c;
  }
  return { body, next: j };
}

function globExpand(field: string, ctx: ShellCtx): string[] {
  if (!/[*?[]/.test(field)) return [field];
  const slash = field.lastIndexOf("/");
  const dirPart = slash >= 0 ? field.slice(0, slash) || "/" : ".";
  const base = slash >= 0 ? field.slice(slash + 1) : field;
  const abs = ctx.fs.normalize(dirPart, ctx.cwd);
  if (!ctx.fs.isDir(abs)) return [field];
  const names = ctx.fs.list(abs).filter((n) => (base.startsWith(".") ? true : !n.startsWith(".")));
  const matches = names.filter((n) => matchGlob(base, n));
  if (matches.length === 0) return [field];
  return matches.map((n) => (slash >= 0 ? `${field.slice(0, slash)}/${n}` : n));
}

function expandParam(inner: string, ctx: ShellCtx): string {
  if (inner.startsWith("#")) return String((ctx.vars[inner.slice(1)] ?? "").length);
  let m = /^(\w+):-(.*)$/.exec(inner);
  if (m) return ctx.vars[m[1]!] || m[2]!;
  m = /^(\w+):=(.*)$/.exec(inner);
  if (m) {
    if (!ctx.vars[m[1]!]) ctx.vars[m[1]!] = m[2]!;
    return ctx.vars[m[1]!]!;
  }
  m = /^(\w+):(\d+):?(\d+)?$/.exec(inner);
  if (m) {
    const v = ctx.vars[m[1]!] ?? "";
    const start = Number(m[2]);
    return m[3] ? v.substr(start, Number(m[3])) : v.slice(start);
  }
  m = /^(\w+)\/([^/]*)\/(.*)$/.exec(inner);
  if (m) return (ctx.vars[m[1]!] ?? "").replace(m[2]!, m[3]!);
  m = /^(\w+)%(.*)$/.exec(inner);
  if (m) {
    const v = ctx.vars[m[1]!] ?? "";
    const re = new RegExp(globToRegex(m[2]!).source.replace(/^\^/, "") + "$");
    return v.replace(re, "");
  }
  m = /^(\w+)#(.*)$/.exec(inner);
  if (m) {
    const v = ctx.vars[m[1]!] ?? "";
    const re = new RegExp("^" + globToRegex(m[2]!).source.replace(/\$$/, ""));
    return v.replace(re, "");
  }
  return ctx.vars[inner] ?? "";
}

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

interface Sink {
  out(text: string): void;
  err(text: string): void;
  stdin?: string;
}

export async function execNode(node: Node, ctx: ShellCtx, sink: Sink): Promise<number> {
  if (ctx.exiting) return ctx.status;
  switch (node.kind) {
    case "seq": {
      let status = 0;
      for (const item of node.items) {
        status = await execNode(item, ctx, sink);
        if (ctx.exiting) break;
      }
      return status;
    }
    case "and": {
      const l = await execNode(node.left, ctx, sink);
      if (l !== 0) return l;
      return execNode(node.right, ctx, sink);
    }
    case "or": {
      const l = await execNode(node.left, ctx, sink);
      if (l === 0) return l;
      return execNode(node.right, ctx, sink);
    }
    case "group":
      return execNode(node.body, ctx, sink);
    case "arith": {
      const v = evalArith(node.expr, ctx);
      ctx.status = v !== 0 ? 0 : 1;
      return ctx.status;
    }
    case "func": {
      ctx.funcs[node.name] = node.body;
      return 0;
    }
    case "if": {
      for (const branch of node.branches) {
        const cond = await execNode(branch.cond, ctx, sink);
        if (cond === 0) return execNode(branch.body, ctx, sink);
      }
      if (node.otherwise) return execNode(node.otherwise, ctx, sink);
      return 0;
    }
    case "while": {
      let status = 0;
      let guard = 0;
      for (;;) {
        if (++guard > 100000) {
          sink.err("bash: loop aborted after 100000 iterations\n");
          return 1;
        }
        const cond = await execNode(node.cond, ctx, sink);
        const ok = node.until ? cond !== 0 : cond === 0;
        if (!ok) break;
        try {
          status = await execNode(node.body, ctx, sink);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (e instanceof ContinueSignal) continue;
          throw e;
        }
        if (ctx.exiting) break;
      }
      return status;
    }
    case "cfor": {
      let status = 0;
      evalArith(node.init, ctx);
      let guard = 0;
      while (node.cond.trim() === "" || evalArith(node.cond, ctx) !== 0) {
        if (++guard > 100000) {
          sink.err("bash: loop aborted after 100000 iterations\n");
          return 1;
        }
        try {
          status = await execNode(node.body, ctx, sink);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (!(e instanceof ContinueSignal)) throw e;
        }
        evalArith(node.step, ctx);
        if (ctx.exiting) break;
      }
      return status;
    }
    case "for": {
      const items: string[] = [];
      for (const raw of node.items) items.push(...(await expandWord(raw, ctx)));
      let status = 0;
      for (const item of items) {
        ctx.vars[node.name] = item;
        try {
          status = await execNode(node.body, ctx, sink);
        } catch (e) {
          if (e instanceof BreakSignal) break;
          if (!(e instanceof ContinueSignal)) throw e;
        }
        if (ctx.exiting) break;
      }
      return status;
    }
    case "case": {
      const word = (await expandWord(node.word, ctx)).join(" ");
      for (const c of node.cases) {
        for (const pattern of c.patterns) {
          const pat = (await expandWord(pattern, ctx)).join(" ") || pattern;
          if (pat === "*" || matchGlob(pat, word)) return execNode(c.body, ctx, sink);
        }
      }
      return 0;
    }
    case "pipeline": {
      let stdin = sink.stdin ?? "";
      let status = 0;
      for (let idx = 0; idx < node.cmds.length; idx++) {
        const isLast = idx === node.cmds.length - 1;
        const buf: string[] = [];
        const childSink: Sink = {
          out: isLast ? sink.out : (t) => buf.push(t),
          err: sink.err,
          stdin,
        };
        status = await execNode(node.cmds[idx]!, ctx, childSink);
        stdin = buf.join("");
      }
      return status;
    }
    case "simple":
      return execSimple(node, ctx, sink);
  }
}

async function execSimple(node: Simple, ctx: ShellCtx, sink: Sink): Promise<number> {
  const fields: string[] = [];
  for (const raw of node.words) fields.push(...(await expandWord(raw, ctx)));

  // leading VAR=value assignments
  let idx = 0;
  const assignments: [string, string][] = [];
  while (idx < fields.length && /^[A-Za-z_]\w*=/.test(fields[idx]!)) {
    const eq = fields[idx]!.indexOf("=");
    assignments.push([fields[idx]!.slice(0, eq), fields[idx]!.slice(eq + 1)]);
    idx++;
  }
  const argv = fields.slice(idx);
  if (argv.length === 0) {
    for (const [k, v] of assignments) ctx.vars[k] = v;
    ctx.status = 0;
    return 0;
  }
  for (const [k, v] of assignments) ctx.vars[k] = v;

  // redirections
  let stdin = sink.stdin ?? "";
  const outBuf: string[] = [];
  let redirectOut: { path: string; append: boolean } | null = null;
  let redirectErr: { path: string; append: boolean } | null = null;

  for (const r of node.redirs) {
    const targets = await expandWord(r.target, ctx);
    const target = targets[0] ?? "";
    const abs = ctx.fs.normalize(target, ctx.cwd);
    if (r.op === "<") {
      const content = ctx.fs.readFile(abs);
      if (content === null) {
        sink.err(`bash: ${target}: No such file or directory\n`);
        ctx.status = 1;
        return 1;
      }
      stdin = content;
    } else if (r.op === "<<<") {
      stdin = target + "\n";
    } else if (r.op === ">" || r.op === ">>") {
      redirectOut = { path: abs, append: r.op === ">>" };
    } else if (r.op === "2>" || r.op === "2>>") {
      redirectErr = { path: abs, append: r.op === "2>>" };
    } else if (r.op === "&>") {
      redirectOut = { path: abs, append: false };
      redirectErr = { path: abs, append: false };
    }
  }

  const errBuf: string[] = [];
  const out = (t: string) => (redirectOut ? outBuf.push(t) : sink.out(t));
  const err = (t: string) => (redirectErr ? errBuf.push(t) : sink.err(t));

  const name = argv[0]!;
  const alias = ctx.aliases[name];
  let finalArgv = argv;
  if (alias) finalArgv = [...alias.split(/\s+/), ...argv.slice(1)];

  let status: number;
  const fnBody = ctx.funcs[finalArgv[0]!];
  if (fnBody) {
    const saved = { ...ctx.vars };
    finalArgv.slice(1).forEach((a, i) => (ctx.vars[String(i + 1)] = a));
    ctx.vars["#"] = String(finalArgv.length - 1);
    ctx.vars["@"] = finalArgv.slice(1).join(" ");
    try {
      status = await execNode(fnBody as Node, ctx, { out, err, stdin });
    } catch (e) {
      if (e instanceof ReturnSignal) status = e.code;
      else throw e;
    }
    ctx.vars = { ...saved };
  } else {
    const io: CmdIO = {
      args: finalArgv,
      stdin,
      out,
      err,
      readLine: () => ctx.host.readLine(),
    };
    const builtin = commands[finalArgv[0]!];
    if (builtin) {
      status = await builtin(io, ctx);
    } else if (finalArgv[0]!.includes("/") || ctx.fs.isFile(ctx.fs.normalize(finalArgv[0]!, ctx.cwd))) {
      status = await runExecutable(finalArgv[0]!, io, ctx);
    } else {
      err(`${finalArgv[0]}: command not found\n`);
      status = 127;
    }
  }

  if (redirectOut) {
    const text = outBuf.join("");
    const e = redirectOut.append
      ? ctx.fs.appendFile(redirectOut.path, text)
      : ctx.fs.writeFile(redirectOut.path, text);
    if (e) sink.err(`bash: ${e}\n`);
  }
  if (redirectErr) {
    const text = errBuf.join("");
    const e = redirectErr.append
      ? ctx.fs.appendFile(redirectErr.path, text)
      : ctx.fs.writeFile(redirectErr.path, text);
    if (e) sink.err(`bash: ${e}\n`);
  }

  ctx.status = status;
  return status;
}

export async function runCommandLine(line: string, ctx: ShellCtx, sink: Sink): Promise<number> {
  try {
    const ast = parse(line);
    return await execNode(ast, ctx, sink);
  } catch (e) {
    if (e instanceof BreakSignal || e instanceof ContinueSignal || e instanceof ReturnSignal) return 0;
    sink.err(`bash: ${(e as Error).message}\n`);
    ctx.status = 2;
    return 2;
  }
}
