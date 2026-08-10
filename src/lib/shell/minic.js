/**
 * A compact C interpreter good enough for classroom practicals:
 * variables, arrays, pointers-lite, control flow, functions, printf/scanf,
 * string.h and math.h helpers.
 */

const isArray = (v) => typeof v === "object" && v !== null && "__array" in v;

/* ----------------------------- Lexer ----------------------------- */

function lex(src) {
  const toks = [];
  let i = 0;
  const ops = [
    "<<=", ">>=", "...", "->", "++", "--", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||", "+=", "-=", "*=", "/=", "%=",
    "&=", "|=", "^=",
  ];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === '"') {
      i++; let s = "";
      while (i < src.length && src[i] !== '"') { if (src[i] === "\\") { s += unescapeChar(src[i + 1]); i += 2; continue; } s += src[i]; i++; }
      i++; toks.push({ t: "str", v: s }); continue;
    }
    if (c === "'") {
      i++; let s = "";
      if (src[i] === "\\") { s = unescapeChar(src[i + 1]); i += 2; } else { s = src[i]; i++; }
      i++; toks.push({ t: "char", v: s }); continue;
    }
    if (/[0-9]/.test(c)) {
      let n = "";
      while (i < src.length && /[0-9.xXa-fA-F]/.test(src[i])) { n += src[i]; i++; }
      toks.push({ t: "num", v: n }); continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let n = "";
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) { n += src[i]; i++; }
      toks.push({ t: "id", v: n }); continue;
    }
    const op = ops.find((o) => src.startsWith(o, i));
    if (op) { toks.push({ t: "op", v: op }); i += op.length; continue; }
    toks.push({ t: "op", v: c }); i++;
  }
  return toks;
}

function unescapeChar(c) {
  const map = { n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", '"': '"', "'": "'" };
  return map[c] ?? c;
}

/* ----------------------------- Parser ---------------------------- */

const TYPES = new Set(["int", "float", "double", "char", "long", "short", "void", "unsigned", "signed", "const"]);

class CParser {
  constructor(toks) { this.toks = toks; this.p = 0; }

  peek(o = 0) { return this.toks[this.p + o]; }
  is(v, o = 0) { return this.peek(o)?.v === v; }
  eat(v) { if (this.is(v)) { this.p++; return true; } return false; }
  expect(v) { if (!this.eat(v)) throw new Error(`expected '${v}' near '${this.peek()?.v ?? "end of file"}'`); }

  parseProgram() {
    const funcs = [];
    while (this.p < this.toks.length) {
      while (this.peek() && TYPES.has(this.peek().v) && !this.isFuncStart()) { while (this.peek() && !this.is(";")) this.p++; this.eat(";"); }
      if (this.p >= this.toks.length) break;
      funcs.push(this.parseFunction());
    }
    return funcs;
  }

  isFuncStart() {
    let o = 0;
    while (this.peek(o) && TYPES.has(this.peek(o).v)) o++;
    while (this.is("*", o)) o++;
    if (this.peek(o)?.t !== "id") return false;
    return this.is("(", o + 1);
  }

  parseFunction() {
    while (this.peek() && TYPES.has(this.peek().v)) this.p++;
    while (this.eat("*")) {}
    const name = this.peek()?.v ?? "main";
    this.p++;
    this.expect("(");
    const params = [];
    while (!this.is(")")) {
      let type = "int";
      while (this.peek() && TYPES.has(this.peek().v)) { type = this.peek().v; this.p++; }
      while (this.eat("*")) type = "ptr";
      const pname = this.peek()?.v ?? "";
      if (this.peek()?.t === "id") this.p++;
      if (this.eat("[")) { while (!this.is("]")) this.p++; this.expect("]"); type = "ptr"; }
      if (pname) params.push({ type, name: pname });
      if (!this.eat(",")) break;
    }
    this.expect(")");
    const body = this.parseBlock();
    return { name, params, body };
  }

  parseBlock() {
    this.expect("{");
    const body = [];
    while (this.peek() && !this.is("}")) body.push(this.parseStmt());
    this.expect("}");
    return { k: "block", body };
  }

  parseStmt() {
    if (this.is("{")) return this.parseBlock();
    if (this.eat(";")) return { k: "block", body: [] };
    const t = this.peek();
    if (t.t === "id" && TYPES.has(t.v) && !this.is("(", 1)) return this.parseDecl();
    if (t.v === "if") {
      this.p++; this.expect("("); const c = this.parseExpr(); this.expect(")");
      const then = this.parseStmt();
      if (this.eat("else")) return { k: "if", c, then, else: this.parseStmt() };
      return { k: "if", c, then };
    }
    if (t.v === "for") {
      this.p++; this.expect("(");
      let init;
      if (!this.is(";")) init = this.peek() && TYPES.has(this.peek().v) ? this.parseDecl() : { k: "expr", e: this.parseExpr() };
      else this.eat(";");
      if (init && init.k === "expr") this.expect(";");
      let cond; if (!this.is(";")) cond = this.parseExpr(); this.expect(";");
      let step; if (!this.is(")")) step = this.parseExpr(); this.expect(")");
      const body = this.parseStmt();
      const out = { k: "for", body };
      if (init) out.init = init; if (cond) out.cond = cond; if (step) out.step = step;
      return out;
    }
    if (t.v === "while") { this.p++; this.expect("("); const c = this.parseExpr(); this.expect(")"); return { k: "while", c, body: this.parseStmt() }; }
    if (t.v === "do") { this.p++; const body = this.parseStmt(); this.expect("while"); this.expect("("); const c = this.parseExpr(); this.expect(")"); this.eat(";"); return { k: "do", c, body }; }
    if (t.v === "switch") {
      this.p++; this.expect("("); const e = this.parseExpr(); this.expect(")"); this.expect("{");
      const cases = [];
      while (!this.is("}")) {
        if (this.eat("case")) { const test = this.parseExpr(); this.expect(":"); cases.push({ test, body: [] }); }
        else if (this.eat("default")) { this.expect(":"); cases.push({ body: [] }); }
        else { const stmt = this.parseStmt(); if (cases.length === 0) cases.push({ body: [] }); cases[cases.length - 1].body.push(stmt); }
      }
      this.expect("}");
      return { k: "switch", e, cases };
    }
    if (t.v === "return") { this.p++; if (this.eat(";")) return { k: "return" }; const e = this.parseExpr(); this.eat(";"); return { k: "return", e }; }
    if (this.eat("break")) { this.eat(";"); return { k: "break" }; }
    if (this.eat("continue")) { this.eat(";"); return { k: "continue" }; }
    const e = this.parseExpr(); this.eat(";");
    return { k: "expr", e };
  }

  parseDecl() {
    let type = "int";
    while (this.peek() && TYPES.has(this.peek().v)) { type = this.peek().v; this.p++; }
    const items = [];
    do {
      while (this.eat("*")) type = "ptr";
      const name = this.peek()?.v ?? ""; this.p++;
      const item = { name };
      if (this.eat("[")) { if (!this.is("]")) item.size = this.parseExpr(); this.expect("]"); if (this.eat("[")) { if (!this.is("]")) this.parseExpr(); this.expect("]"); } }
      if (this.eat("=")) {
        if (this.eat("{")) {
          const list = [];
          while (!this.is("}")) {
            if (this.eat("{")) { while (!this.is("}")) { list.push(this.parseAssign()); this.eat(","); } this.expect("}"); this.eat(","); continue; }
            list.push(this.parseAssign()); this.eat(",");
          }
          this.expect("}"); item.initList = list;
        } else item.init = this.parseAssign();
      }
      items.push(item);
    } while (this.eat(","));
    this.eat(";");
    return { k: "decl", type, items };
  }

  parseExpr() { let e = this.parseAssign(); while (this.eat(",")) e = { k: "bin", op: ",", l: e, r: this.parseAssign() }; return e; }

  parseAssign() {
    const left = this.parseCond();
    const ops = ["=", "+=", "-=", "*=", "/=", "%="];
    const t = this.peek();
    if (t && t.t === "op" && ops.includes(t.v)) { this.p++; return { k: "assign", op: t.v, target: left, value: this.parseAssign() }; }
    return left;
  }

  parseCond() { const c = this.parseBinary(0); if (this.eat("?")) { const a = this.parseAssign(); this.expect(":"); const b = this.parseAssign(); return { k: "cond", c, a, b }; } return c; }

  static LEVELS = [["||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"]];

  parseBinary(level) {
    if (level >= CParser.LEVELS.length) return this.parseUnary();
    let left = this.parseBinary(level + 1);
    for (;;) { const t = this.peek(); if (!t || t.t !== "op" || !CParser.LEVELS[level].includes(t.v)) break; this.p++; left = { k: "bin", op: t.v, l: left, r: this.parseBinary(level + 1) }; }
    return left;
  }

  parseUnary() {
    const t = this.peek();
    if (t && t.t === "op" && ["-", "!", "+", "~", "*", "&", "++", "--"].includes(t.v)) { this.p++; return { k: "un", op: t.v, e: this.parseUnary() }; }
    if (t && t.v === "(" && this.peek(1) && TYPES.has(this.peek(1).v)) { this.p++; while (this.peek() && !this.is(")")) this.p++; this.expect(")"); return this.parseUnary(); }
    return this.parsePostfix();
  }

  parsePostfix() {
    let e = this.parsePrimary();
    for (;;) {
      if (this.eat("[")) { const index = this.parseExpr(); this.expect("]"); if (this.eat("[")) { this.parseExpr(); this.expect("]"); } e = { k: "index", base: e, index }; continue; }
      const t = this.peek();
      if (t && (t.v === "++" || t.v === "--")) { this.p++; e = { k: "post", op: t.v, e }; continue; }
      break;
    }
    return e;
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) throw new Error("unexpected end of file");
    if (t.t === "num") { this.p++; return { k: "num", v: Number(t.v) }; }
    if (t.t === "str") { this.p++; return { k: "str", v: t.v }; }
    if (t.t === "char") { this.p++; return { k: "num", v: t.v.charCodeAt(0) }; }
    if (t.v === "(") { this.p++; const e = this.parseExpr(); this.expect(")"); return e; }
    if (t.t === "id") {
      this.p++;
      if (this.eat("(")) { const args = []; while (!this.is(")")) { args.push(this.parseAssign()); if (!this.eat(",")) break; } this.expect(")"); return { k: "call", name: t.v, args }; }
      return { k: "var", name: t.v };
    }
    this.p++; return { k: "num", v: 0 };
  }
}

/* --------------------------- Interpreter -------------------------- */

class ReturnValue { constructor(value) { this.value = value; } }
class BreakErr {}
class ContinueErr {}

function toNum(v) {
  if (v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v.length ? v.charCodeAt(0) : 0;
  return 0;
}

function arrToString(a) {
  let s = "";
  for (const c of a.__array) { const n = typeof c === "number" ? c : 0; if (n === 0) break; s += String.fromCharCode(n); }
  return s;
}

function toStr(v) {
  if (v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return arrToString(v);
}

function fromString(s, size) {
  const arr = [...s].map((c) => c.charCodeAt(0));
  arr.push(0);
  if (size) while (arr.length < size) arr.push(0);
  return { __array: arr };
}

export class CInterpreter {
  constructor(io) {
    this.io = io;
    this.funcs = new Map();
    this.globals = {};
    this.scopes = [];
    this.inputBuffer = [];
    this.steps = 0;
  }

  load(source) {
    const parser = new CParser(lex(source));
    for (const f of parser.parseProgram()) this.funcs.set(f.name, f);
  }

  async run(args) {
    const main = this.funcs.get("main");
    if (!main) { this.io.err("/usr/bin/ld: undefined reference to `main'\n"); return 1; }
    try {
      const argv = { __array: args.map((a) => a) };
      const result = await this.callFunction(main, [args.length, argv]);
      return toNum(result) & 0xff;
    } catch (e) {
      if (e instanceof ReturnValue) return toNum(e.value) & 0xff;
      this.io.err(`runtime error: ${e.message}\n`);
      return 1;
    }
  }

  async callFunction(fn, args) {
    const scope = {};
    fn.params.forEach((p, i) => (scope[p.name] = args[i] ?? 0));
    this.scopes.push(scope);
    try { await this.execStmt(fn.body); return 0; }
    catch (e) { if (e instanceof ReturnValue) return e.value; throw e; }
    finally { this.scopes.pop(); }
  }

  lookupScope(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) { if (name in this.scopes[i]) return this.scopes[i]; }
    if (name in this.globals) return this.globals;
    return null;
  }

  getVar(name) { const s = this.lookupScope(name); return s ? s[name] : 0; }
  setVar(name, value) { const s = this.lookupScope(name); if (s) s[name] = value; else if (this.scopes.length) this.scopes[this.scopes.length - 1][name] = value; else this.globals[name] = value; }

  async execStmt(stmt) {
    if (++this.steps > 3_000_000) throw new Error("program exceeded the execution limit");
    switch (stmt.k) {
      case "block": for (const s of stmt.body) await this.execStmt(s); return;
      case "decl":
        for (const item of stmt.items) {
          if (item.initList) { const values = []; for (const e of item.initList) values.push(await this.eval(e)); this.declare(item.name, { __array: values }); }
          else if (item.size !== undefined) { const n = toNum(await this.eval(item.size)); if (item.init) { const v = await this.eval(item.init); this.declare(item.name, typeof v === "string" ? fromString(v, n) : v); } else this.declare(item.name, { __array: new Array(Math.max(0, n)).fill(0) }); }
          else if (item.init) { const v = await this.eval(item.init); this.declare(item.name, stmt.type === "char" && typeof v === "string" ? fromString(v) : v); }
          else if (item.name.length) { this.declare(item.name, stmt.type === "ptr" ? "" : 0); }
        }
        return;
      case "expr": await this.eval(stmt.e); return;
      case "if": if (toNum(await this.eval(stmt.c))) await this.execStmt(stmt.then); else if (stmt.else) await this.execStmt(stmt.else); return;
      case "while":
        while (toNum(await this.eval(stmt.c))) { try { await this.execStmt(stmt.body); } catch (e) { if (e instanceof BreakErr) break; if (!(e instanceof ContinueErr)) throw e; } }
        return;
      case "do":
        do { try { await this.execStmt(stmt.body); } catch (e) { if (e instanceof BreakErr) break; if (!(e instanceof ContinueErr)) throw e; } } while (toNum(await this.eval(stmt.c)));
        return;
      case "for":
        if (stmt.init) await this.execStmt(stmt.init);
        for (;;) {
          if (stmt.cond && !toNum(await this.eval(stmt.cond))) break;
          try { await this.execStmt(stmt.body); } catch (e) { if (e instanceof BreakErr) break; if (!(e instanceof ContinueErr)) throw e; }
          if (stmt.step) await this.eval(stmt.step);
        }
        return;
      case "switch": {
        const value = toNum(await this.eval(stmt.e)); let matched = false;
        try {
          for (const c of stmt.cases) {
            if (!matched) { if (c.test === undefined) matched = true; else if (toNum(await this.eval(c.test)) === value) matched = true; }
            if (matched) for (const s of c.body) await this.execStmt(s);
          }
        } catch (e) { if (!(e instanceof BreakErr)) throw e; }
        return;
      }
      case "return": throw new ReturnValue(stmt.e ? await this.eval(stmt.e) : 0);
      case "break": throw new BreakErr();
      case "continue": throw new ContinueErr();
    }
  }

  declare(name, value) { if (this.scopes.length) this.scopes[this.scopes.length - 1][name] = value; else this.globals[name] = value; }

  async assignTo(target, value) {
    if (target.k === "var") { const existing = this.getVar(target.name); if (isArray(existing) && typeof value === "string") { const next = fromString(value, existing.__array.length); this.setVar(target.name, next); return next; } this.setVar(target.name, value); return value; }
    if (target.k === "index") { const base = await this.eval(target.base); const idx = toNum(await this.eval(target.index)); if (isArray(base)) { base.__array[idx] = value; return value; } return value; }
    if (target.k === "un" && target.op === "*") return this.assignTo(target.e, value);
    return value;
  }

  async eval(e) {
    if (++this.steps > 3_000_000) throw new Error("program exceeded the execution limit");
    switch (e.k) {
      case "num": return e.v;
      case "str": return e.v;
      case "var": return this.getVar(e.name);
      case "index": { const base = await this.eval(e.base); const idx = toNum(await this.eval(e.index)); if (isArray(base)) return base.__array[idx] ?? 0; if (typeof base === "string") return base.charCodeAt(idx) || 0; return 0; }
      case "cond": return toNum(await this.eval(e.c)) ? this.eval(e.a) : this.eval(e.b);
      case "un": {
        if (e.op === "++" || e.op === "--") { const v = toNum(await this.eval(e.e)) + (e.op === "++" ? 1 : -1); await this.assignTo(e.e, v); return v; }
        if (e.op === "&" || e.op === "*") return this.eval(e.e);
        const v = await this.eval(e.e);
        if (e.op === "-") return -toNum(v); if (e.op === "+") return toNum(v); if (e.op === "!") return toNum(v) ? 0 : 1; if (e.op === "~") return ~toNum(v);
        return v;
      }
      case "post": { const old = toNum(await this.eval(e.e)); await this.assignTo(e.e, old + (e.op === "++" ? 1 : -1)); return old; }
      case "assign": { const value = await this.eval(e.value); if (e.op === "=") return this.assignTo(e.target, value); const cur = toNum(await this.eval(e.target)); const r = toNum(value); const map = { "+=": cur + r, "-=": cur - r, "*=": cur * r, "/=": r === 0 ? 0 : cur / r, "%=": r === 0 ? 0 : cur % r }; return this.assignTo(e.target, map[e.op] ?? cur); }
      case "bin": {
        if (e.op === "&&") return toNum(await this.eval(e.l)) && toNum(await this.eval(e.r)) ? 1 : 0;
        if (e.op === "||") return toNum(await this.eval(e.l)) || toNum(await this.eval(e.r)) ? 1 : 0;
        const l = await this.eval(e.l); const r = await this.eval(e.r);
        if (e.op === ",") return r;
        const a = toNum(l); const b = toNum(r);
        switch (e.op) {
          case "+": return a + b; case "-": return a - b; case "*": return a * b;
          case "/": return b === 0 ? 0 : Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b;
          case "%": return b === 0 ? 0 : a % b;
          case "<": return a < b ? 1 : 0; case ">": return a > b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0; case ">=": return a >= b ? 1 : 0;
          case "==": return a === b ? 1 : 0; case "!=": return a !== b ? 1 : 0;
          case "&": return a & b; case "|": return a | b; case "^": return a ^ b;
          case "<<": return a << b; case ">>": return a >> b;
          default: return 0;
        }
      }
      case "call": return this.callByName(e.name, e.args);
    }
  }

  async nextInputToken(wholeLine = false) {
    for (;;) {
      if (wholeLine) { if (this.inputBuffer.length) return this.inputBuffer.splice(0, this.inputBuffer.length).join(" "); }
      else if (this.inputBuffer.length) { return this.inputBuffer.shift(); }
      const line = await this.io.readLine();
      if (line === null) return "";
      if (wholeLine) return line;
      this.inputBuffer = line.split(/\s+/).filter(Boolean);
      if (!this.inputBuffer.length) continue;
    }
  }

  async callByName(name, argExprs) {
    const user = this.funcs.get(name);
    if (user) { const args = []; for (const a of argExprs) args.push(await this.eval(a)); return this.callFunction(user, args); }

    if (name === "printf" || name === "fprintf") {
      const exprs = name === "fprintf" ? argExprs.slice(1) : argExprs;
      const fmt = toStr(await this.eval(exprs[0]));
      const args = []; for (const a of exprs.slice(1)) args.push(await this.eval(a));
      const text = formatC(fmt, args);
      if (name === "fprintf") this.io.err(text); else this.io.out(text);
      return text.length;
    }
    if (name === "puts") { const s = toStr(await this.eval(argExprs[0])); this.io.out(s + "\n"); return s.length + 1; }
    if (name === "putchar") { const n = toNum(await this.eval(argExprs[0])); this.io.out(String.fromCharCode(n)); return n; }
    if (name === "scanf" || name === "fscanf") {
      const exprs = name === "fscanf" ? argExprs.slice(1) : argExprs;
      const fmt = toStr(await this.eval(exprs[0]));
      const specs = fmt.match(/%[a-zA-Z]/g) ?? [];
      let count = 0;
      for (let i = 0; i < specs.length; i++) {
        const target = exprs[i + 1]; if (!target) break;
        const spec = specs[i]; const token = await this.nextInputToken(spec === "%s" && false);
        if (token === "") break;
        const dest = target.k === "un" && target.op === "&" ? target.e : target;
        if (spec === "%s") await this.assignTo(dest, fromString(token));
        else if (spec === "%c") await this.assignTo(dest, token.charCodeAt(0));
        else if (spec === "%f" || spec === "%lf" || spec === "%g") await this.assignTo(dest, Number(token) || 0);
        else await this.assignTo(dest, Math.trunc(Number(token)) || 0);
        count++;
      }
      return count;
    }
    if (name === "gets" || name === "fgets") { const line = (await this.io.readLine()) ?? ""; const dest = argExprs[0]; await this.assignTo(dest.k === "un" && dest.op === "&" ? dest.e : dest, fromString(line)); return 1; }
    if (name === "getchar") { const t = await this.nextInputToken(); return t.charCodeAt(0) || 0; }

    const args = []; for (const a of argExprs) args.push(await this.eval(a));
    const n0 = toNum(args[0]); const n1 = toNum(args[1]);
    switch (name) {
      case "strlen": return toStr(args[0]).length;
      case "strcpy": return this.assignTo(argExprs[0], fromString(toStr(args[1])));
      case "strcat": return this.assignTo(argExprs[0], fromString(toStr(args[0]) + toStr(args[1])));
      case "strcmp": return toStr(args[0]) < toStr(args[1]) ? -1 : toStr(args[0]) > toStr(args[1]) ? 1 : 0;
      case "strrev": return this.assignTo(argExprs[0], fromString([...toStr(args[0])].reverse().join("")));
      case "sqrt": return Math.sqrt(n0); case "pow": return Math.pow(n0, n1);
      case "abs": case "fabs": return Math.abs(n0);
      case "floor": return Math.floor(n0); case "ceil": return Math.ceil(n0); case "round": return Math.round(n0);
      case "sin": return Math.sin(n0); case "cos": return Math.cos(n0); case "tan": return Math.tan(n0);
      case "log": return Math.log(n0); case "log10": return Math.log10(n0); case "exp": return Math.exp(n0);
      case "rand": return Math.floor(Math.random() * 32768); case "srand": return 0;
      case "atoi": return Math.trunc(Number(toStr(args[0]))) || 0; case "atof": return Number(toStr(args[0])) || 0;
      case "toupper": return String.fromCharCode(n0).toUpperCase().charCodeAt(0);
      case "tolower": return String.fromCharCode(n0).toLowerCase().charCodeAt(0);
      case "isdigit": return /[0-9]/.test(String.fromCharCode(n0)) ? 1 : 0;
      case "isalpha": return /[a-zA-Z]/.test(String.fromCharCode(n0)) ? 1 : 0;
      case "malloc": case "calloc": return { __array: new Array(Math.max(0, n0)).fill(0) };
      case "free": case "fflush": case "sleep": return 0;
      case "exit": throw new ReturnValue(n0);
      default: this.io.err(`warning: implicit declaration of function '${name}'\n`); return 0;
    }
  }
}

export function formatC(fmt, args) {
  let out = ""; let ai = 0;
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i];
    if (c !== "%") { out += c; continue; }
    if (fmt[i + 1] === "%") { out += "%"; i++; continue; }
    let spec = "%"; i++;
    while (i < fmt.length && /[-+ 0#]/.test(fmt[i])) spec += fmt[i++];
    while (i < fmt.length && /[0-9*]/.test(fmt[i])) spec += fmt[i++];
    if (fmt[i] === ".") { spec += fmt[i++]; while (i < fmt.length && /[0-9]/.test(fmt[i])) spec += fmt[i++]; }
    while (i < fmt.length && /[hlL]/.test(fmt[i])) spec += fmt[i++];
    const conv = fmt[i] ?? ""; spec += conv;
    const arg = args[ai++];
    const flags = /^%([-+ 0#]*)/.exec(spec)?.[1] ?? "";
    const width = Number(/%[-+ 0#]*(\d+)/.exec(spec)?.[1] ?? 0);
    const prec = /\.(\d+)/.exec(spec)?.[1];
    let text;
    switch (conv) {
      case "d": case "i": case "u": text = String(Math.trunc(toNum(arg))); break;
      case "f": case "F": text = toNum(arg).toFixed(prec !== undefined ? Number(prec) : 6); break;
      case "e": text = toNum(arg).toExponential(prec !== undefined ? Number(prec) : 6); break;
      case "g": text = String(toNum(arg)); break;
      case "s": text = toStr(arg); if (prec !== undefined) text = text.slice(0, Number(prec)); break;
      case "c": text = typeof arg === "string" ? arg[0] ?? "" : String.fromCharCode(toNum(arg)); break;
      case "x": text = (toNum(arg) >>> 0).toString(16); break;
      case "X": text = (toNum(arg) >>> 0).toString(16).toUpperCase(); break;
      case "o": text = (toNum(arg) >>> 0).toString(8); break;
      case "p": text = "0x" + (0x1000 + ai).toString(16); break;
      case "l": text = String(Math.trunc(toNum(arg))); break;
      default: text = spec; ai--;
    }
    if (width > text.length) { const pad = flags.includes("0") && !flags.includes("-") ? "0" : " "; text = flags.includes("-") ? text.padEnd(width, " ") : text.padStart(width, pad); }
    out += text;
  }
  return out;
}

/** Very light syntax check, mimicking common gcc diagnostics. */
export function checkC(source, filename) {
  const errors = [];
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  const opens = (stripped.match(/\{/g) ?? []).length;
  const closes = (stripped.match(/\}/g) ?? []).length;
  if (opens !== closes) errors.push(`${filename}: error: expected declaration or statement at end of input`);
  if (!/\bmain\s*\(/.test(stripped)) errors.push("/usr/bin/ld: /usr/lib/x86_64-linux-gnu/Scrt1.o: undefined reference to `main'");
  try { new CParser(lex(source)).parseProgram(); }
  catch (err) { errors.push(`${filename}: error: ${err.message}`); }
  return errors;
}
