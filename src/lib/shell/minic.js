/**
 * A compact C interpreter good enough for classroom practicals:
 * variables, arrays, pointers-lite, control flow, functions, printf/scanf,
 * string.h, math.h and POSIX filesystem helpers.
 *
 * Supports OS practicals 6–8:
 *   Practical 6 — stat(), S_ISDIR/S_ISREG, file metadata
 *   Practical 7 — opendir(), readdir(), closedir(), struct dirent
 *   Practical 8 — fork(), wait(), zombie/orphan process simulation
 */

import { globalProcessTable } from "./process-table.js";

const isArray = (v) => typeof v === "object" && v !== null && "__array" in v;

/* ------------------------------------------------------------------ */
/* Header → declared-functions map (suppresses implicit-declaration    */
/* warnings for functions that ARE declared by the included headers).  */
/* ------------------------------------------------------------------ */

const HEADER_DECLS = {
  "stdio.h":    ["printf","fprintf","scanf","fscanf","puts","putchar","getchar","gets","fgets","fflush","perror","sprintf","sscanf","fopen","fclose","fread","fwrite","feof","ferror","rewind","fseek","ftell","fgets","fputs"],
  "stdlib.h":   ["exit","abort","malloc","calloc","realloc","free","atoi","atof","atol","rand","srand","abs","qsort","bsearch"],
  "string.h":   ["strlen","strcpy","strncpy","strcat","strncat","strcmp","strncmp","strrev","strcspn","memset","memcpy","memmove","strchr","strstr","strtok","strerror"],
  "math.h":     ["sqrt","pow","fabs","floor","ceil","round","sin","cos","tan","asin","acos","atan","atan2","log","log2","log10","exp","fmod"],
  "unistd.h":   ["fork","getpid","getppid","sleep","usleep","pipe","close","read","write","exec","execl","execv","execvp","dup","dup2","chdir","getcwd","access","unlink","rmdir","lseek","getuid","getgid","geteuid","getegid"],
  "sys/types.h":[],
  "sys/stat.h": ["stat","lstat","fstat","chmod","mkdir","umask","mkfifo","S_ISDIR","S_ISREG","S_ISLNK","S_ISBLK","S_ISCHR","S_ISFIFO","S_ISSOCK"],
  "sys/wait.h": ["wait","waitpid","WIFEXITED","WEXITSTATUS","WIFSIGNALED","WTERMSIG"],
  "sys/ipc.h":  ["ftok"],
  "sys/msg.h":  ["msgget","msgsnd","msgrcv","msgctl"],
  "sys/sem.h":  ["semget","semctl","semop"],
  "sys/mman.h": ["mmap","munmap"],
  "semaphore.h": ["sem_init","sem_wait","sem_post","sem_destroy"],
  "dirent.h":   ["opendir","readdir","closedir","rewinddir","scandir","alphasort"],
  "time.h":     ["time","clock","difftime","mktime","localtime","gmtime","strftime","ctime"],
  "ctype.h":    ["isdigit","isalpha","isalnum","isspace","isupper","islower","toupper","tolower","isprint","ispunct"],
  "assert.h":   ["assert"],
  "errno.h":    ["perror"],
  "fcntl.h":    ["open","creat","fcntl"],
  "signal.h":   ["signal","kill","raise"],
  "limits.h":   [],
  "stddef.h":   [],
  "stdarg.h":   [],
};

/**
 * Parse #include directives from C source and return the set of
 * function names that are considered "declared" (no warning needed).
 */
function extractDeclaredFunctions(source) {
  const declared = new Set();
  const re = /#include\s*[<"]([^>"]+)[>"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const header = m[1];
    const fns = HEADER_DECLS[header];
    if (fns) fns.forEach((f) => declared.add(f));
  }
  return declared;
}

/* ------------------------------------------------------------------ */
/* Preprocessor  (#define macro expansion)                            */
/* ------------------------------------------------------------------ */

/**
 * Minimal C preprocessor: expands object-like #define macros.
 * Only handles simple `#define NAME value` forms (no function-like macros).
 * All other # lines are left for the lexer to discard.
 */
function preprocess(source) {
  const defines = new Map();

  // Pass 1 – collect #define directives and erase them
  const withoutDefines = source.replace(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(.+?)[ \t]*$/gm,
    (_, name, value) => { defines.set(name, value.trim()); return ''; });

  if (defines.size === 0) return source; // nothing to expand

  // Pass 2 – substitute each macro name as a whole word
  let result = withoutDefines;
  for (const [name, value] of defines) {
    result = result.replace(new RegExp(`\\b${name}\\b`, 'g'), value);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Lexer                                                               */
/* ------------------------------------------------------------------ */

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
    // Skip preprocessor lines (but we already extracted headers above)
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

/* ------------------------------------------------------------------ */
/* Parser                                                             */
/* ------------------------------------------------------------------ */

const TYPES = new Set([
  // fundamental
  "int","float","double","char","long","short","void","unsigned","signed",
  // qualifiers / storage class (consumed but ignored)
  "const","volatile","static","extern","register","auto","inline","typedef",
  // POSIX typedef'd scalar types
  "pid_t","size_t","ssize_t","off_t","ino_t","mode_t","nlink_t","uid_t","gid_t",
  "dev_t","blksize_t","blkcnt_t","time_t","clock_t","socklen_t","key_t","sem_t","uint8_t",
  "uint16_t","uint32_t","int8_t","int16_t","int32_t",
  // struct / union / enum keywords (consumed as a type token)
  "struct","union","enum",
  // common opaque pointer types used in practicals 6 & 7
  "DIR","FILE","dirent","stat","timeval","timespec","message","sembuf","semid_ds","semun",
]);

class CParser {
  constructor(toks) { this.toks = toks; this.p = 0; }

  peek(o = 0) { return this.toks[this.p + o]; }
  is(v, o = 0) { return this.peek(o)?.v === v; }
  eat(v) { if (this.is(v)) { this.p++; return true; } return false; }
  expect(v) { if (!this.eat(v)) throw new Error(`expected '${v}' near '${this.peek()?.v ?? "end of file"}'`); }

  parseProgram() {
    const funcs = [];
    while (this.p < this.toks.length) {
      // Skip complete aggregate definitions, including anonymous typedefs
      // such as `typedef struct { ... } shared_data;`, and remember their
      // names so declarations using the new type parse normally.
      const typedefOffset = this.is("typedef") ? 1 : 0;
      if (this.is("struct", typedefOffset) || this.is("union", typedefOffset)) {
        let braceOffset = typedefOffset + 1;
        let tagName = null;
        if (this.peek(braceOffset)?.t === "id") {
          tagName = this.peek(braceOffset).v;
          braceOffset++;
        }
        if (!this.is("{", braceOffset)) {
          // This is a declaration rather than a definition; let the regular
          // declaration/function parser handle it below.
        } else {
          this.p += braceOffset + 1;
          let depth = 1;
          while (this.peek() && depth > 0) {
            if (this.eat("{")) depth++;
            else if (this.eat("}")) depth--;
            else this.p++;
          }
          let aliasName = null;
          if (this.peek()?.t === "id") {
            aliasName = this.peek().v;
            this.p++;
          }
          this.eat(";");
          if (tagName) TYPES.add(tagName);
          if (aliasName) TYPES.add(aliasName);
          continue;
        }
      }
      // Retain support for the older `struct name { ... };` path if unusual
      // tokens placed the opening brace outside the detection window above.
      if ((this.is("struct") || this.is("union")) && this.is("{", 2)) {
        this.p += 3;
        let depth = 1;
        while (this.peek() && depth > 0) {
          if (this.eat("{")) depth++;
          else if (this.eat("}")) depth--;
          else this.p++;
        }
        this.eat(";");
        continue;
      }
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
      if (this.eat("[")) { while (!this.is("]")) this.p++; this.expect("]"); }
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
      if (this.eat(".")) { const field = this.peek()?.v ?? ""; this.p++; e = { k: "field", base: e, field }; continue; }
      if (this.eat("->")) { const field = this.peek()?.v ?? ""; this.p++; e = { k: "field", base: e, field }; continue; }
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

/* ------------------------------------------------------------------ */
/* Special signals used to implement fork() dual-run                  */
/* ------------------------------------------------------------------ */

class ForkSignal {
  constructor() { this.type = "ForkSignal"; }
}

/* ------------------------------------------------------------------ */
/* Interpreter helpers                                                 */
/* ------------------------------------------------------------------ */

class ReturnValue { constructor(value) { this.value = value; } }
class BreakErr {}
class ContinueErr {}
export class ProcessInterrupted extends Error {
  constructor() { super("process interrupted"); this.name = "ProcessInterrupted"; }
}

function toNum(v) {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v.length ? v.charCodeAt(0) : 0;
  if (typeof v === "object") {
    // Struct / DIR objects expose a fake non-zero memory address so that
    // NULL-checks like `while (entry = readdir(dir)) != NULL` work correctly.
    if ("__addr" in v) return v.__addr;
    // char arrays / malloc'd memory are truthy (non-null pointer)
    if ("__array" in v) return 1;
  }
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

// System V message queues are shared by every terminal interpreter instance,
// matching the machine-wide behavior students expect from msgget(2).
const messageQueues = new Map();
let nextMessageQueueId = 1;

const systemVSemaphores = new Map();
let nextSystemVSemaphoreId = 1;

function makeSemaphore(value = 0) {
  return { __semaphore: true, value: Math.max(0, toNum(value)), waiters: [], initialized: false };
}

function systemVSemaphoreById(id) {
  for (const semaphore of systemVSemaphores.values()) if (semaphore.id === id) return semaphore;
  return null;
}

async function waitSemaphore(semaphore) {
  if (!semaphore?.__semaphore) return -1;
  if (semaphore.value > 0) {
    semaphore.value--;
    return 0;
  }
  return new Promise((resolve) => semaphore.waiters.push(() => resolve(0)));
}

function postSemaphore(semaphore) {
  if (!semaphore?.__semaphore) return -1;
  const waiter = semaphore.waiters.shift();
  if (waiter) waiter();
  else semaphore.value++;
  return 0;
}

function messageQueueById(id) {
  for (const queue of messageQueues.values()) if (queue.id === id) return queue;
  return null;
}

/* ------------------------------------------------------------------ */
/* CInterpreter                                                        */
/* ------------------------------------------------------------------ */

export class CInterpreter {
  /**
   * @param {object} io   { out, err, readLine }
   * @param {object} opts { pid, ppid, processTable, forkMode, forkChildPid, execName }
   */
  constructor(io, opts = {}) {
    this.io = io;
    this.funcs = new Map();
    this.scopes = [];
    this.inputBuffer = [];
    this.steps = 0;

    // Process identity
    this.processTable = opts.processTable ?? globalProcessTable;
    this.pid  = opts.pid  ?? 1001;
    this.ppid = opts.ppid ?? 1;
    this.execName = opts.execName ?? "a.out";

    // Fork dual-run state
    this.forkMode     = opts.forkMode     ?? null;
    this.forkChildPid = opts.forkChildPid ?? 0;
    this.forkCallCount = 0;

    // VFS access (passed from exec.js for filesystem syscalls)
    this.vfs = opts.fs  ?? null;
    this.cwd = opts.cwd ?? "/home/student";

    // File descriptor table  { fd → { type, content, pos, path } }
    this._fdTable = new Map([
      [0, { type: "stdin"  }],
      [1, { type: "stdout" }],
      [2, { type: "stderr" }],
    ]);
    this._nextFd = 3;

    // Counter for unique fake addresses assigned to struct/DIR objects
    this._structAddr = 100;

    // Last errno set by a syscall (used by perror())
    this._lastErrno = 0;

    // MAP_SHARED allocations are replayed when the simulator re-runs main()
    // for the child and parent sides of fork(). Both sides receive the same
    // objects, which lets POSIX semaphores coordinate real async execution.
    this._sharedMappings = opts.sharedMappings ?? [];
    this._mappingCursor = 0;
    this.control = opts.control ?? null;
    this.signalHandlers = new Map();

    // Pre-defined C constants injected as globals so code using them works
    // without explicit #define (common in simple teaching programs).
    this.globals = {
      NULL: 0, EOF: -1,
      STDIN_FILENO: 0, STDOUT_FILENO: 1, STDERR_FILENO: 2,
      EXIT_SUCCESS: 0, EXIT_FAILURE: 1,
      RAND_MAX: 32767,
      // fcntl.h flags
      O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2,
      O_CREAT: 64, O_TRUNC: 512, O_APPEND: 1024, O_EXCL: 128,
      // System V IPC flags and commands
      IPC_CREAT: 0o1000, IPC_EXCL: 0o2000, IPC_NOWAIT: 0o4000, IPC_RMID: 0,
      GETVAL: 12, SETVAL: 16,
      // mmap flags/protection values
      PROT_NONE: 0, PROT_READ: 1, PROT_WRITE: 2, PROT_EXEC: 4,
      MAP_SHARED: 1, MAP_PRIVATE: 2, MAP_ANONYMOUS: 0x20, MAP_ANON: 0x20,
      MAP_FAILED: -1,
      // common signal constants
      SIG_DFL: 0, SIG_IGN: 1, SIGCONT: 18, SIGTSTP: 20,
      // lseek whence
      SEEK_SET: 0, SEEK_CUR: 1, SEEK_END: 2,
      // stat mode type bits
      S_IFMT: 0o170000, S_IFSOCK: 0o140000, S_IFLNK: 0o120000,
      S_IFREG: 0o100000, S_IFBLK: 0o060000, S_IFDIR: 0o040000,
      S_IFCHR: 0o020000, S_IFIFO: 0o010000,
      // common permission bits
      S_IRWXU: 0o700, S_IRUSR: 0o400, S_IWUSR: 0o200, S_IXUSR: 0o100,
      S_IRWXG: 0o070, S_IRGRP: 0o040, S_IWGRP: 0o020, S_IXGRP: 0o010,
      S_IRWXO: 0o007, S_IROTH: 0o004, S_IWOTH: 0o002, S_IXOTH: 0o001,
      // access() mode bits
      F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1,
      // dirent d_type
      DT_UNKNOWN: 0, DT_FIFO: 1, DT_CHR: 2, DT_DIR: 4,
      DT_BLK: 6, DT_REG: 8, DT_LNK: 10, DT_SOCK: 12,
      // misc
      PATH_MAX: 4096, NAME_MAX: 255, BUFSIZ: 8192,
      // errno values (simplified)
      ENOENT: 2, EACCES: 13, EEXIST: 17, ENOTDIR: 20,
      EISDIR: 21, EINVAL: 22, ENOSPC: 28, ENAMETOOLONG: 36,
    };

    // Set of function names declared by the program's headers (no warning needed)
    this.declaredFunctions = new Set();
  }

  load(source) {
    // extractDeclaredFunctions needs the original source so #include lines are visible
    this.declaredFunctions = extractDeclaredFunctions(source);
    // preprocess expands #define macros before the lexer/parser sees the code
    const preprocessed = preprocess(source);
    const parser = new CParser(lex(preprocessed));
    for (const f of parser.parseProgram()) this.funcs.set(f.name, f);
  }

  async run(args) {
    const main = this.funcs.get("main");
    if (!main) { this.io.err("/usr/bin/ld: undefined reference to `main'\n"); return 1; }
    const argv = { __array: args.map((a) => a) };

    // ----------------------------------------------------------------
    // Normal (non-fork) execution
    // ----------------------------------------------------------------
    if (this.forkMode !== null) {
      // This is a child or parent re-run — just execute directly
      try {
        const result = await this.callFunction(main, [args.length, argv]);
        return toNum(result) & 0xff;
      } catch (e) {
        if (e instanceof ReturnValue) return toNum(e.value) & 0xff;
        if (!(e instanceof ForkSignal)) {
          this.io.err(`runtime error: ${e.message}\n`);
          return 1;
        }
        return 0;
      } finally {
        // Clean up this process from the table when it finishes
        this.processTable.markZombie(this.pid, 0);
      }
    }

    // ----------------------------------------------------------------
    // First run — may hit a ForkSignal
    // ----------------------------------------------------------------
    try {
      const result = await this.callFunction(main, [args.length, argv]);
      // No fork() was called — clean up normally
      this.processTable.remove(this.pid);
      return toNum(result) & 0xff;
    } catch (e) {
      if (e instanceof ReturnValue) {
        this.processTable.remove(this.pid);
        return toNum(e.value) & 0xff;
      }
      if (e instanceof ForkSignal) {
        // ---- Dual-run fork simulation ----
        return this._runFork(main, args, argv);
      }
      if (e instanceof ProcessInterrupted) {
        this.processTable.remove(this.pid);
        return 130;
      }
      this.io.err(`runtime error: ${e.message}\n`);
      this.processTable.remove(this.pid);
      return 1;
    }
  }

  /**
   * Orchestrate the child run followed by the parent run after fork().
   */
  async _runFork(main, args, argv) {
    if (this._sharedMappings.length > 0) return this._runSharedMemoryFork(main, args);

    // Allocate child PID
    const childPid = this.processTable.alloc(this.pid, this.execName);

    // ---- Child run ----
    const childInterp = new CInterpreter(this.io, {
      processTable: this.processTable,
      pid:          childPid,
      ppid:         this.pid,
      forkMode:     "child",
      forkChildPid: 0,
      execName:     this.execName,
      fs:           this.vfs,
      cwd:          this.cwd,
    });
    // Share parsed functions and a copy of globals
    childInterp.funcs = this.funcs;
    childInterp.declaredFunctions = this.declaredFunctions;
    childInterp.globals = { ...this.globals };

    try {
      const childArgv = { __array: args.map((a) => a) };
      await childInterp.callFunction(main, [args.length, childArgv]);
    } catch (childErr) {
      if (childErr instanceof ReturnValue) {
        // Child exited via return — mark zombie if parent hasn't waited yet
        this.processTable.markZombie(childPid, toNum(childErr.value));
      } else if (!(childErr instanceof ForkSignal)) {
        // Unexpected error in child
        this.io.err(`child process error: ${childErr.message}\n`);
        this.processTable.markZombie(childPid, 1);
      }
    }
    // If child didn't throw ReturnValue, it fell off the end — exit(0)
    if (this.processTable.procs.get(childPid)?.state === "R") {
      this.processTable.markZombie(childPid, 0);
    }

    // ---- Parent run ----
    // Reset state for re-execution as parent
    this.scopes = [];
    this.globals = {};
    this.inputBuffer = [];
    this.steps = 0;
    this.forkMode = "parent";
    this.forkChildPid = childPid;
    this.forkCallCount = 0;

    try {
      const parentArgv = { __array: args.map((a) => a) };
      const result = await this.callFunction(main, [args.length, parentArgv]);
      this.processTable.remove(this.pid);
      return toNum(result) & 0xff;
    } catch (parentErr) {
      if (parentErr instanceof ReturnValue) {
        this.processTable.remove(this.pid);
        return toNum(parentErr.value) & 0xff;
      }
      this.io.err(`runtime error: ${parentErr.message}\n`);
      this.processTable.remove(this.pid);
      return 1;
    }
  }

  /**
   * Run both sides concurrently when memory was mapped before fork(). This is
   * needed for producer/consumer programs: the child can wait on `full` while
   * the parent posts an item, and both see the same buffer and indices.
   */
  async _runSharedMemoryFork(main, args) {
    const childPid = this.processTable.alloc(this.pid, this.execName);
    const inheritedGlobals = { ...this.globals };
    const childInterp = new CInterpreter(this.io, {
      processTable: this.processTable,
      pid: childPid,
      ppid: this.pid,
      forkMode: "child",
      forkChildPid: 0,
      execName: this.execName,
      fs: this.vfs,
      cwd: this.cwd,
      sharedMappings: this._sharedMappings,
    });
    childInterp.funcs = this.funcs;
    childInterp.declaredFunctions = this.declaredFunctions;
    childInterp.globals = { ...inheritedGlobals };
    childInterp._mappingCursor = 0;

    this.scopes = [];
    this.globals = { ...inheritedGlobals };
    this.inputBuffer = [];
    this.steps = 0;
    this.forkMode = "parent";
    this.forkChildPid = childPid;
    this.forkCallCount = 0;
    this._mappingCursor = 0;

    const childArgv = { __array: args.map((a) => a) };
    const childPromise = (async () => {
      let status = 0;
      try {
        status = toNum(await childInterp.callFunction(main, [args.length, childArgv])) & 0xff;
      } catch (error) {
        if (error instanceof ReturnValue) status = toNum(error.value) & 0xff;
        else {
          this.io.err(`child process error: ${error.message}\n`);
          status = 1;
        }
      }
      this.processTable.markZombie(childPid, status);
      return status;
    })();
    this._childCompletion = childPromise;

    let parentStatus = 0;
    try {
      const parentArgv = { __array: args.map((a) => a) };
      parentStatus = toNum(await this.callFunction(main, [args.length, parentArgv])) & 0xff;
    } catch (error) {
      if (error instanceof ReturnValue) parentStatus = toNum(error.value) & 0xff;
      else {
        this.io.err(`runtime error: ${error.message}\n`);
        parentStatus = 1;
      }
    } finally {
      await childPromise;
      this._childCompletion = null;
      this.processTable.remove(this.pid);
    }
    return parentStatus;
  }

  async callFunction(fn, args) {
    const scope = {};
    fn.params.forEach((p, i) => (scope[p.name] = args[i] ?? 0));
    this.scopes.push(scope);
    try { await this.execStmt(fn.body); return 0; }
    catch (e) { if (e instanceof ReturnValue) return e.value; throw e; }
    finally { this.scopes.pop(); }
  }

  async deliverSignal(signalNumber) {
    const handler = this.signalHandlers.get(signalNumber);
    if (handler === this.globals.SIG_IGN) return 0;
    if (typeof handler === "string" && this.funcs.has(handler)) {
      return this.callFunction(this.funcs.get(handler), [signalNumber]);
    }
    if (signalNumber === this.globals.SIGTSTP) this.control?.pause();
    return 0;
  }

  lookupScope(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) { if (name in this.scopes[i]) return this.scopes[i]; }
    if (name in this.globals) return this.globals;
    return null;
  }

  getVar(name) { const s = this.lookupScope(name); return s ? s[name] : 0; }
  setVar(name, value) { const s = this.lookupScope(name); if (s) s[name] = value; else if (this.scopes.length) this.scopes[this.scopes.length - 1][name] = value; else this.globals[name] = value; }

  async execStmt(stmt) {
    await this.control?.checkpoint();
    if (++this.steps > 3_000_000) throw new Error("program exceeded the execution limit");
    switch (stmt.k) {
      case "block": for (const s of stmt.body) await this.execStmt(s); return;
      case "decl":
        for (const item of stmt.items) {
          if (item.initList) { const values = []; for (const e of item.initList) values.push(await this.eval(e)); this.declare(item.name, { __array: values }); }
          else if (item.size !== undefined) { const n = toNum(await this.eval(item.size)); if (item.init) { const v = await this.eval(item.init); this.declare(item.name, typeof v === "string" ? fromString(v, n) : v); } else this.declare(item.name, { __array: new Array(Math.max(0, n)).fill(0) }); }
          else if (item.init) { const v = await this.eval(item.init); this.declare(item.name, stmt.type === "char" && typeof v === "string" ? fromString(v) : v); }
          else if (item.name.length) {
            if (stmt.type === "message") {
              this.declare(item.name, { __struct: "message", __addr: ++this._structAddr, type: 0, text: fromString("", 100) });
            } else if (stmt.type === "semun") {
              this.declare(item.name, { __struct: "semun", __addr: ++this._structAddr, val: 0 });
            } else if (stmt.type === "sem_t") {
              this.declare(item.name, makeSemaphore(0));
            } else this.declare(item.name, stmt.type === "ptr" ? "" : 0);
          }
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
    if (target.k === "field") {
      const base = await this.eval(target.base);
      if (base !== null && typeof base === "object" && !("__array" in base)) {
        const existing = base[target.field];
        base[target.field] = isArray(existing) && typeof value === "string"
          ? fromString(value, existing.__array.length)
          : value;
        return base[target.field];
      }
      return value;
    }
    if (target.k === "un" && target.op === "*") return this.assignTo(target.e, value);
    return value;
  }

  async eval(e) {
    await this.control?.checkpoint();
    if (++this.steps > 3_000_000) throw new Error("program exceeded the execution limit");
    switch (e.k) {
      case "num": return e.v;
      case "str": return e.v;
      case "var": return this.getVar(e.name);
      case "field": {
        // Resolve struct/DIR objects by reading their JS properties directly.
        // This makes `entry->d_name`, `st.st_size`, `dir->pos` all work.
        const base = await this.eval(e.base);
        if (base !== null && typeof base === "object" && !("__array" in base)) {
          const val = base[e.field];
          if (val !== undefined) return val;
        }
        return 0;
      }
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
    // User-defined functions take priority
    const user = this.funcs.get(name);
    if (user) { const args = []; for (const a of argExprs) args.push(await this.eval(a)); return this.callFunction(user, args); }

    // ----------------------------------------------------------------
    // System V semaphores
    // ----------------------------------------------------------------

    if (name === "semget") {
      const key = toNum(await this.eval(argExprs[0]));
      const flags = toNum(await this.eval(argExprs[2]));
      let semaphore = systemVSemaphores.get(key);
      if (!semaphore && (flags & this.globals.IPC_CREAT)) {
        semaphore = { id: nextSystemVSemaphoreId++, key, sets: [makeSemaphore(0)] };
        systemVSemaphores.set(key, semaphore);
      }
      return semaphore?.id ?? -1;
    }

    if (name === "semctl") {
      const id = toNum(await this.eval(argExprs[0]));
      const index = toNum(await this.eval(argExprs[1]));
      const command = toNum(await this.eval(argExprs[2]));
      const semaphore = systemVSemaphoreById(id);
      if (!semaphore) return -1;
      const target = semaphore.sets[index];
      if (!target) return -1;
      if (command === this.globals.SETVAL) {
        const unionArg = await this.eval(argExprs[3]);
        target.value = Math.max(0, toNum(unionArg?.val ?? unionArg));
        return 0;
      }
      if (command === this.globals.GETVAL) return target.value;
      if (command === this.globals.IPC_RMID) {
        systemVSemaphores.delete(semaphore.key);
        return 0;
      }
      return 0;
    }

    if (name === "semop") {
      const id = toNum(await this.eval(argExprs[0]));
      const operation = await this.eval(argExprs[1]);
      const semaphore = systemVSemaphoreById(id);
      if (!semaphore || !isArray(operation)) return -1;
      const index = toNum(operation.__array[0]);
      const delta = toNum(operation.__array[1]);
      const target = semaphore.sets[index];
      if (!target) return -1;
      if (delta < 0) {
        for (let i = 0; i < Math.abs(delta); i++) {
          const status = await waitSemaphore(target);
          if (status !== 0) return status;
        }
      } else {
        for (let i = 0; i < delta; i++) postSemaphore(target);
      }
      return 0;
    }

    // ----------------------------------------------------------------
    // POSIX shared memory and unnamed semaphores
    // ----------------------------------------------------------------

    if (name === "mmap") {
      const existing = this._sharedMappings[this._mappingCursor++];
      if (existing) return existing;
      const mapping = {
        __struct: "shared_memory",
        __addr: ++this._structAddr,
        buffer: { __array: new Array(64).fill(0) },
        in: 0,
        out: 0,
        empty: makeSemaphore(0),
        full: makeSemaphore(0),
        mutex: makeSemaphore(0),
      };
      this._sharedMappings.push(mapping);
      return mapping;
    }

    if (name === "munmap") return 0;

    if (name === "sem_init") {
      const targetExpr = argExprs[0];
      let semaphore = await this.eval(targetExpr);
      if (!semaphore?.__semaphore) {
        semaphore = makeSemaphore(0);
        const destination = targetExpr?.k === "un" && targetExpr.op === "&" ? targetExpr.e : targetExpr;
        if (destination) await this.assignTo(destination, semaphore);
      }
      // Re-running main() is how this interpreter models fork(). A semaphore
      // in MAP_SHARED memory has already been initialized before fork and must
      // not be reset independently by the child/parent replay.
      if (!semaphore.initialized) {
        semaphore.value = Math.max(0, toNum(await this.eval(argExprs[2])));
        semaphore.waiters.length = 0;
        semaphore.initialized = true;
      }
      return 0;
    }

    if (name === "sem_wait") return waitSemaphore(await this.eval(argExprs[0]));
    if (name === "sem_post") return postSemaphore(await this.eval(argExprs[0]));
    if (name === "sem_destroy") {
      const semaphore = await this.eval(argExprs[0]);
      if (!semaphore?.__semaphore) return -1;
      semaphore.waiters.length = 0;
      return 0;
    }

    // ----------------------------------------------------------------
    // System V message queues — Practical 9.2
    // ----------------------------------------------------------------

    if (name === "msgget") {
      const key = toNum(await this.eval(argExprs[0]));
      const flags = toNum(await this.eval(argExprs[1]));
      let queue = messageQueues.get(key);
      if (!queue && (flags & this.globals.IPC_CREAT)) {
        queue = { id: nextMessageQueueId++, key, messages: [], waiters: [] };
        messageQueues.set(key, queue);
      }
      return queue?.id ?? -1;
    }

    if (name === "msgsnd") {
      const id = toNum(await this.eval(argExprs[0]));
      const source = await this.eval(argExprs[1]);
      const queue = messageQueueById(id);
      if (!queue || !source || typeof source !== "object") return -1;
      const message = { type: toNum(source.type) || 1, text: toStr(source.text) };
      const waiterIndex = queue.waiters.findIndex((waiter) => waiter.type === 0 || waiter.type === message.type);
      if (waiterIndex >= 0) {
        const waiter = queue.waiters.splice(waiterIndex, 1)[0];
        waiter.dest.type = message.type;
        waiter.dest.text = fromString(message.text, 100);
        waiter.resolve(message.text.length + 1);
      } else queue.messages.push(message);
      return 0;
    }

    if (name === "msgrcv") {
      const id = toNum(await this.eval(argExprs[0]));
      const dest = await this.eval(argExprs[1]);
      const requestedType = toNum(await this.eval(argExprs[3]));
      const flags = toNum(await this.eval(argExprs[4]));
      const queue = messageQueueById(id);
      if (!queue || !dest || typeof dest !== "object") return -1;
      const index = queue.messages.findIndex((message) => requestedType === 0 || message.type === requestedType);
      if (index >= 0) {
        const message = queue.messages.splice(index, 1)[0];
        dest.type = message.type;
        dest.text = fromString(message.text, 100);
        return message.text.length + 1;
      }
      if (flags & this.globals.IPC_NOWAIT) return -1;
      return new Promise((resolve) => queue.waiters.push({ type: requestedType, dest, resolve }));
    }

    if (name === "msgctl") {
      const id = toNum(await this.eval(argExprs[0]));
      const command = toNum(await this.eval(argExprs[1]));
      const queue = messageQueueById(id);
      if (!queue) return -1;
      if (command === this.globals.IPC_RMID) {
        messageQueues.delete(queue.key);
        for (const waiter of queue.waiters.splice(0)) waiter.resolve(-1);
      }
      return 0;
    }

    // ----------------------------------------------------------------
    // Filesystem syscalls — Practicals 6 & 7
    // ----------------------------------------------------------------

    if (name === "opendir") {
      const pathStr = toStr(await this.eval(argExprs[0]));
      if (!this.vfs) return 0;
      const absPath = this.vfs.normalize(pathStr, this.cwd);
      const node = this.vfs.lookup(absPath);
      if (!node || node.type !== "dir") { this.io.err(`opendir: ${pathStr}: No such file or directory\n`); return 0; }
      // Include . and .. plus sorted children
      const entries = [".", "..", ...this.vfs.list(absPath)];
      const addr = ++this._structAddr;
      return { __dir: true, __addr: addr, _vfsPath: absPath, _entries: entries, _pos: 0 };
    }

    if (name === "readdir") {
      const dir = await this.eval(argExprs[0]);
      if (!dir || typeof dir !== "object" || !dir.__dir) return 0; // NULL
      if (dir._pos >= dir._entries.length) return 0; // end of directory
      const entryName = dir._entries[dir._pos++];
      const entryPath = (dir._vfsPath === "/" ? "" : dir._vfsPath) + "/" + entryName;
      const node = this.vfs?.lookup(this.vfs.normalize(entryPath, "/")) ?? null;
      const isDir = node?.type === "dir";
      // Fake inode: hash of the path (deterministic, always > 0)
      const ino = Math.abs(entryPath.split("").reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 1));
      const addr = ++this._structAddr;
      return {
        __struct: "dirent", __addr: addr,
        d_ino: ino || 1,
        d_name: entryName,
        d_type: isDir ? 4 : 8, // DT_DIR=4, DT_REG=8
        d_reclen: 0, d_off: dir._pos,
      };
    }

    if (name === "closedir" || name === "rewinddir") {
      const dir = await this.eval(argExprs[0]);
      if (name === "rewinddir" && dir && typeof dir === "object") dir._pos = 0;
      return 0;
    }

    // stat / lstat — fill a struct stat via pointer
    if (name === "stat" || name === "lstat") {
      const pathStr = toStr(await this.eval(argExprs[0]));
      const bufExpr = argExprs[1];
      if (!this.vfs) return -1;
      const absPath = this.vfs.normalize(pathStr, this.cwd);
      const node = this.vfs.lookup(absPath);
      if (!node) { this.io.err(`${name}: cannot stat '${pathStr}': No such file or directory\n`); return -1; }
      const isDir  = node.type === "dir";
      const isFifo = node.type === "fifo";
      const content = isDir || isFifo ? "" : (node.content ?? "");
      const ino = Math.abs(absPath.split("").reduce((h, c) => Math.imul(31, h) + c.charCodeAt(0) | 0, 1)) || 1;
      const modeBase = node.mode ?? (isDir ? 0o755 : 0o644);
      // Type bits: dir=040000, fifo=010000, regular=100000
      const modeTypeBit = isDir ? 0o040000 : isFifo ? 0o010000 : 0o100000;
      const st = {
        __struct: "stat", __addr: ++this._structAddr,
        st_dev: 1, st_ino: ino,
        st_mode: modeTypeBit | modeBase,
        st_nlink: isDir ? 2 : 1,
        st_uid: 1000, st_gid: 1000,
        st_rdev: 0,
        st_size: content.length,
        st_blksize: 4096,
        st_blocks: Math.ceil(content.length / 512),
        st_atime: Math.floor((node.mtime ?? Date.now()) / 1000),
        st_mtime: Math.floor((node.mtime ?? Date.now()) / 1000),
        st_ctime: Math.floor((node.mtime ?? Date.now()) / 1000),
      };
      // Assign to the pointer arg (e.g. &st or buf)
      const dest = bufExpr?.k === "un" && bufExpr.op === "&" ? bufExpr.e : bufExpr;
      if (dest) await this.assignTo(dest, st);
      return 0;
    }

    // fstat — stat by file descriptor
    if (name === "fstat") {
      const fd = toNum(await this.eval(argExprs[0]));
      const bufExpr = argExprs[1];
      const entry = this._fdTable.get(fd);
      if (!entry || !entry.path || !this.vfs) return -1;
      // Re-use stat logic
      return this.callByName("stat", [{ k: "str", v: entry.path }, bufExpr]);
    }

    // open() — return a file descriptor
    if (name === "open" || name === "creat") {
      const pathStr = toStr(await this.eval(argExprs[0]));
      const flags   = toNum(await this.eval(argExprs[1] ?? { k: "num", v: 0 }));
      if (!this.vfs) return -1;
      const absPath = this.vfs.normalize(pathStr, this.cwd);
      const O_WRONLY = 1, O_RDWR = 2, O_CREAT = 64, O_TRUNC = 512, O_APPEND = 1024;
      const forWrite = (flags & (O_WRONLY | O_RDWR)) !== 0 || name === "creat";
      const doCreate = (flags & O_CREAT) !== 0 || name === "creat";
      let node = this.vfs.lookup(absPath);
      if (!node) {
        if (!doCreate) { this.io.err(`open: ${pathStr}: No such file or directory\n`); return -1; }
        this.vfs.writeFile(absPath, "", 0o644);
        node = this.vfs.lookup(absPath);
      }
      // Handle FIFO (named pipe) — connect fd to the FIFO's shared buffer
      if (node?.type === "fifo") {
        const fd = this._nextFd++;
        this._fdTable.set(fd, {
          type: "fifo",
          path: absPath,
          // For reading: we'll read from the FIFO buffer at close/read time.
          // For writing: data accumulates in 'content' then is flushed to the FIFO buffer on close.
          content: forWrite ? "" : (node.buffer ?? ""),
          pos: 0,
          writable: forWrite,
          fifoNode: node,
        });
        return fd;
      }
      if (node?.type === "dir") { this.io.err(`open: ${pathStr}: Is a directory\n`); return -1; }
      const content = node?.content ?? "";
      const fd = this._nextFd++;
      this._fdTable.set(fd, {
        type: "file",
        path: absPath,
        content: (flags & O_TRUNC) ? "" : content,
        pos: (flags & O_APPEND) ? content.length : 0,
        writable: forWrite,
      });
      return fd;
    }

    // read() — read bytes from fd into buffer
    if (name === "read") {
      const fd    = toNum(await this.eval(argExprs[0]));
      const bufExpr = argExprs[1];
      const count = toNum(await this.eval(argExprs[2] ?? { k: "num", v: 0 }));
      if (fd === 0) {
        // stdin
        const line = (await this.io.readLine()) ?? "";
        const chunk = line.slice(0, count);
        const dest = bufExpr?.k === "un" && bufExpr.op === "&" ? bufExpr.e : bufExpr;
        if (dest) await this.assignTo(dest, fromString(chunk));
        return chunk.length;
      }
      const entry = this._fdTable.get(fd);
      if (!entry) return -1;
      const chunk = entry.content.slice(entry.pos, entry.pos + count);
      entry.pos += chunk.length;
      const dest = bufExpr?.k === "un" && bufExpr.op === "&" ? bufExpr.e : bufExpr;
      if (dest) await this.assignTo(dest, fromString(chunk));
      return chunk.length;
    }

    // write() — write bytes from buffer to fd
    if (name === "write") {
      const fd    = toNum(await this.eval(argExprs[0]));
      const buf   = await this.eval(argExprs[1]);
      const count = toNum(await this.eval(argExprs[2] ?? { k: "num", v: 0 }));
      const text  = toStr(buf).slice(0, count);
      if (fd === 1) { this.io.out(text); return text.length; }
      if (fd === 2) { this.io.err(text); return text.length; }
      const entry = this._fdTable.get(fd);
      if (!entry || !entry.writable) return -1;
      const before = entry.content.slice(0, entry.pos);
      const after  = entry.content.slice(entry.pos + text.length);
      entry.content = before + text + after;
      entry.pos += text.length;
      // Persist to VFS (skip FIFOs — their buffer is flushed on close() instead;
      // calling writeFile on a FIFO path would replace the FIFO node with a regular file)
      if (entry.path && this.vfs && entry.type !== "fifo") this.vfs.writeFile(entry.path, entry.content);
      return text.length;
    }

    // close() — already handled in unistd.h section for fork; also handle fd close
    if (name === "close" && argExprs.length >= 1) {
      const fd = toNum(await this.eval(argExprs[0]));
      if (fd >= 3) {
        const entry = this._fdTable.get(fd);
        // If this is a writable FIFO fd, flush the accumulated content to the FIFO buffer
        if (entry?.type === "fifo" && entry.writable && entry.fifoNode) {
          entry.fifoNode.buffer = entry.content;
          entry.fifoNode.mtime = Date.now();
          if (this.vfs) this.vfs.persist();
        }
        this._fdTable.delete(fd);
      }
      return 0;
    }

    // lseek()
    if (name === "lseek") {
      const fd     = toNum(await this.eval(argExprs[0]));
      const offset = toNum(await this.eval(argExprs[1] ?? { k: "num", v: 0 }));
      const whence = toNum(await this.eval(argExprs[2] ?? { k: "num", v: 0 }));
      const entry  = this._fdTable.get(fd);
      if (!entry) return -1;
      const len = entry.content?.length ?? 0;
      if (whence === 0 /* SEEK_SET */) entry.pos = offset;
      else if (whence === 1 /* SEEK_CUR */) entry.pos = entry.pos + offset;
      else if (whence === 2 /* SEEK_END */) entry.pos = len + offset;
      entry.pos = Math.max(0, Math.min(entry.pos, len));
      return entry.pos;
    }

    // access(path, mode) — always succeeds for existing files
    if (name === "access") {
      const pathStr = toStr(await this.eval(argExprs[0]));
      if (!this.vfs) return -1;
      const absPath = this.vfs.normalize(pathStr, this.cwd);
      return this.vfs.lookup(absPath) ? 0 : -1;
    }

    // chmod(path, mode)
    if (name === "chmod") {
      const pathStr = toStr(await this.eval(argExprs[0]));
      const mode    = toNum(await this.eval(argExprs[1] ?? { k: "num", v: 0 }));
      if (!this.vfs) return -1;
      const absPath = this.vfs.normalize(pathStr, this.cwd);
      const err = this.vfs.chmod(absPath, mode);
      return err ? -1 : 0;
    }

    // getcwd(buf, size)
    if (name === "getcwd") {
      const bufExpr = argExprs[0];
      const dest = bufExpr?.k === "un" && bufExpr.op === "&" ? bufExpr.e : bufExpr;
      if (dest) await this.assignTo(dest, fromString(this.cwd));
      return dest ? 1 : 0; // return non-null (truthy)
    }

    // chdir(path)
    if (name === "chdir") {
      const pathStr = toStr(await this.eval(argExprs[0]));
      if (!this.vfs) return -1;
      const absPath = this.vfs.normalize(pathStr, this.cwd);
      if (this.vfs.isDir(absPath)) { this.cwd = absPath; return 0; }
      return -1;
    }

    // S_IS* — POSIX mode-type test macros (used as function calls in our interpreter)
    if (name === "S_ISDIR" || name === "S_ISREG" || name === "S_ISLNK" ||
        name === "S_ISBLK" || name === "S_ISCHR" || name === "S_ISFIFO" || name === "S_ISSOCK") {
      const mode = toNum(await this.eval(argExprs[0]));
      const typeMap = { S_ISDIR:0o040000, S_ISREG:0o100000, S_ISLNK:0o120000,
                        S_ISBLK:0o060000, S_ISCHR:0o020000, S_ISFIFO:0o010000, S_ISSOCK:0o140000 };
      return (mode & 0o170000) === typeMap[name] ? 1 : 0;
    }

    // getuid / getgid
    if (name === "getuid" || name === "geteuid") return 1000;
    if (name === "getgid" || name === "getegid") return 1000;

    // ----------------------------------------------------------------
    // Process simulation syscalls (Practical 8)
    // ----------------------------------------------------------------

    if (name === "signal") {
      const signalNumber = toNum(await this.eval(argExprs[0]));
      const handlerExpr = argExprs[1];
      const handler = handlerExpr?.k === "var" && this.funcs.has(handlerExpr.name)
        ? handlerExpr.name
        : toNum(await this.eval(handlerExpr));
      const previous = this.signalHandlers.get(signalNumber) ?? this.globals.SIG_DFL;
      this.signalHandlers.set(signalNumber, handler);
      return previous;
    }

    if (name === "raise") {
      return this.deliverSignal(toNum(await this.eval(argExprs[0])));
    }

    if (name === "kill") {
      const pid = toNum(await this.eval(argExprs[0]));
      const signalNumber = toNum(await this.eval(argExprs[1]));
      return pid === this.pid ? this.deliverSignal(signalNumber) : -1;
    }

    if (name === "fork") {
      if (this.forkMode === "child") {
        // We're in the child re-run — return 0
        return 0;
      }
      if (this.forkMode === "parent") {
        // We're in the parent re-run — return the child PID
        return this.forkChildPid;
      }
      // First encounter — throw ForkSignal to trigger dual-run
      throw new ForkSignal();
    }

    if (name === "getpid") {
      return this.pid;
    }

    if (name === "getppid") {
      // Look up live ppid from process table (supports orphan re-parenting)
      const entry = this.processTable.procs.get(this.pid);
      return entry ? entry.ppid : this.ppid;
    }

    if (name === "wait" || name === "waitpid") {
      if (this._childCompletion) await this._childCompletion;
      // Reap a zombie child
      const reaped = this.processTable.reap(this.pid);
      if (reaped > 0) {
        // Zero out the status pointer argument if provided (wait(NULL) is common)
        // No-op since we can't write to a C pointer in this simulator
      }
      return reaped; // returns child PID on success, -1 if none
    }

    if (name === "perror") {
      const msg = toStr(await this.eval(argExprs[0]));
      this.io.err(`${msg}: ${this._lastErrno ? "No such file or directory" : "Success"}\n`);
      return 0;
    }

    // mkfifo(path, mode)
    if (name === "mkfifo") {
      const pathStr = toStr(await this.eval(argExprs[0]));
      if (!this.vfs) return -1;
      const absPath = this.vfs.normalize(pathStr, this.cwd);
      const err = this.vfs.mkfifo(absPath);
      if (err) { this._lastErrno = 17; /* EEXIST */ this.io.err(`mkfifo: ${pathStr}: File exists\n`); return -1; }
      return 0;
    }

    // ----------------------------------------------------------------
    // stdio
    // ----------------------------------------------------------------

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
    if (name === "fflush") { return 0; }

    // ----------------------------------------------------------------
    // Evaluate remaining args for built-ins that need them
    // ----------------------------------------------------------------
    const args = []; for (const a of argExprs) args.push(await this.eval(a));
    const n0 = toNum(args[0]); const n1 = toNum(args[1]);

    switch (name) {
      // string.h
      case "strlen": return toStr(args[0]).length;
      case "strcpy": return this.assignTo(argExprs[0], fromString(toStr(args[1])));
      case "strncpy": return this.assignTo(argExprs[0], fromString(toStr(args[1]).slice(0, n1)));
      case "strcat": return this.assignTo(argExprs[0], fromString(toStr(args[0]) + toStr(args[1])));
      case "strcmp": return toStr(args[0]) < toStr(args[1]) ? -1 : toStr(args[0]) > toStr(args[1]) ? 1 : 0;
      case "strrev": return this.assignTo(argExprs[0], fromString([...toStr(args[0])].reverse().join("")));
      case "strcspn": { const s = toStr(args[0]); const reject = toStr(args[1]); let i = 0; while (i < s.length && !reject.includes(s[i])) i++; return i; }
      case "memset": if (isArray(args[0])) { args[0].__array.fill(n1); } return args[0];
      // math.h
      case "sqrt": return Math.sqrt(n0); case "pow": return Math.pow(n0, n1);
      case "abs": case "fabs": return Math.abs(n0);
      case "floor": return Math.floor(n0); case "ceil": return Math.ceil(n0); case "round": return Math.round(n0);
      case "sin": return Math.sin(n0); case "cos": return Math.cos(n0); case "tan": return Math.tan(n0);
      case "log": return Math.log(n0); case "log2": return Math.log2(n0); case "log10": return Math.log10(n0); case "exp": return Math.exp(n0);
      // stdlib.h
      case "rand": return Math.floor(Math.random() * 32768); case "srand": return 0;
      case "atoi": return Math.trunc(Number(toStr(args[0]))) || 0; case "atof": return Number(toStr(args[0])) || 0;
      case "malloc": case "calloc": return { __array: new Array(Math.max(0, n0)).fill(0) };
      case "free": return 0;
      // ctype.h
      case "toupper": return String.fromCharCode(n0).toUpperCase().charCodeAt(0);
      case "tolower": return String.fromCharCode(n0).toLowerCase().charCodeAt(0);
      case "isdigit": return /[0-9]/.test(String.fromCharCode(n0)) ? 1 : 0;
      case "isalpha": return /[a-zA-Z]/.test(String.fromCharCode(n0)) ? 1 : 0;
      case "isalnum": return /[a-zA-Z0-9]/.test(String.fromCharCode(n0)) ? 1 : 0;
      case "isspace": return /\s/.test(String.fromCharCode(n0)) ? 1 : 0;
      case "isupper": return /[A-Z]/.test(String.fromCharCode(n0)) ? 1 : 0;
      case "islower": return /[a-z]/.test(String.fromCharCode(n0)) ? 1 : 0;
      case "isprint": return n0 >= 32 && n0 < 127 ? 1 : 0;
      // sleep — update process state and wait exact duration
      case "sleep": {
        const requestedSecs = Math.max(0, n0);
        const actualMs = requestedSecs * 1000;
        this.processTable.markSleeping(this.pid);
        if (actualMs > 0) {
          await new Promise((r) => setTimeout(r, actualMs));
        }
        this.processTable.markRunning(this.pid);
        return 0;
      }
      case "usleep": {
        const us = Math.max(0, n0);
        const ms = Math.floor(us / 1000);
        this.processTable.markSleeping(this.pid);
        if (ms > 0) await new Promise((r) => setTimeout(r, ms));
        this.processTable.markRunning(this.pid);
        return 0;
      }
      // exit — mark zombie then throw
      case "exit": case "abort": {
        const status = name === "abort" ? 134 : n0;
        this.processTable.markZombie(this.pid, status);
        throw new ReturnValue(status);
      }
      // WIFEXITED / WEXITSTATUS macros (simplified)
      case "WIFEXITED": return 1;
      case "WEXITSTATUS": return n0 & 0xff;
      case "WIFSIGNALED": return 0;
      case "WTERMSIG": return 0;
      default: {
        // Only warn for truly undeclared functions
        if (!this.declaredFunctions.has(name)) {
          this.io.err(`warning: implicit declaration of function '${name}'\n`);
        }
        return 0;
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* printf format string formatter                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Syntax check (used by gcc command in commands.js)                  */
/* ------------------------------------------------------------------ */

/** Very light syntax check, mimicking common gcc diagnostics. */
export function checkC(source, filename) {
  const preprocessed = preprocess(source);
  const errors = [];
  const stripped = preprocessed.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  const opens = (stripped.match(/\{/g) ?? []).length;
  const closes = (stripped.match(/\}/g) ?? []).length;
  if (opens !== closes) errors.push(`${filename}: error: expected declaration or statement at end of input`);
  if (!/\bmain\s*\(/.test(stripped)) errors.push("/usr/bin/ld: /usr/lib/x86_64-linux-gnu/Scrt1.o: undefined reference to `main'");
  try { new CParser(lex(preprocessed)).parseProgram(); }
  catch (err) { errors.push(`${filename}: error: ${err.message}`); }
  return errors;
}
