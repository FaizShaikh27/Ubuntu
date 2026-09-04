import { HOME, modeString, shortDate } from "./fs.js";
import { evalArith, matchGlob, BreakSignal, ContinueSignal, ReturnSignal } from "./interpreter.js";
import { makeBinary, runScript } from "./exec.js";
import { checkC } from "./minic.js";
import { globalProcessTable } from "./process-table.js";

const abs = (ctx, p) => ctx.fs.normalize(p, ctx.cwd);

function splitFlags(args) {
  const flags = new Set();
  const rest = [];
  const opts = [];
  for (const a of args) {
    if (a.startsWith("--")) {
      opts.push(a);
    } else if (a.startsWith("-") && a.length > 1 && !/^-\d/.test(a)) {
      for (const c of a.slice(1)) flags.add(c);
    } else rest.push(a);
  }
  return { flags, rest, opts };
}

function lines(text) {
  const l = text.split("\n");
  if (l.length && l[l.length - 1] === "") l.pop();
  return l;
}

function inputText(io, ctx, files) {
  if (files.length === 0) return { text: io.stdin };
  const parts = [];
  for (const f of files) {
    const content = ctx.fs.readFile(abs(ctx, f));
    if (content === null) return { text: parts.join(""), error: f };
    parts.push(content);
  }
  return { text: parts.join("") };
}

function shellUnescape(text) {
  return text.replace(/\\(.)/g, (_, c) => {
    const map = { n: "\n", t: "\t", r: "\r", "\\": "\\", a: "", e: "\u001b", "0": "\0" };
    return map[c] ?? "\\" + c;
  });
}

const MANPAGES = {
  ls: "ls - list directory contents\n\nUsage: ls [-l] [-a] [-h] [FILE]...",
  cd: "cd - change the shell working directory\n\nUsage: cd [DIR]",
  gcc: "gcc - GNU C compiler\n\nUsage: gcc [-o OUTPUT] [-Wall] file.c",
  grep: "grep - print lines matching a pattern\n\nUsage: grep [-i] [-v] [-n] [-c] PATTERN [FILE]...",
  chmod: "chmod - change file mode bits\n\nUsage: chmod MODE FILE...",
};

export const commands = {
  /* ------------------------- navigation ------------------------- */
  pwd: (io, ctx) => { io.out(ctx.cwd + "\n"); return 0; },
  cd: (io, ctx) => {
    const target = io.args[1] ?? ctx.vars["HOME"] ?? HOME;
    const dest = target === "-" ? ctx.vars["OLDPWD"] ?? ctx.cwd : abs(ctx, target);
    if (!ctx.fs.lookup(dest)) { io.err(`bash: cd: ${target}: No such file or directory\n`); return 1; }
    if (!ctx.fs.isDir(dest)) { io.err(`bash: cd: ${target}: Not a directory\n`); return 1; }
    ctx.vars["OLDPWD"] = ctx.cwd;
    ctx.cwd = dest;
    ctx.vars["PWD"] = dest;
    return 0;
  },
  ls: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    const targets = rest.length ? rest : ["."];
    let status = 0;
    const chunks = [];
    for (const target of targets) {
      const path = abs(ctx, target);
      const node = ctx.fs.lookup(path);
      if (!node) { io.err(`ls: cannot access '${target}': No such file or directory\n`); status = 2; continue; }
      const entries = [];
      if (node.type === "file" || node.type === "fifo") entries.push({ name: target, node });
      else {
        for (const name of ctx.fs.list(path)) {
          if (!flags.has("a") && name.startsWith(".")) continue;
          entries.push({ name, node: ctx.fs.lookup(path === "/" ? "/" + name : path + "/" + name) });
        }
        if (flags.has("a")) entries.unshift({ name: ".", node }, { name: "..", node });
      }
      const header = targets.length > 1 ? `${target}:\n` : "";
      if (flags.has("l")) {
        const body = entries.map((e) => {
          const size = e.node.type === "file" ? e.node.content.length : 0;
          return `${modeString(e.node)} 1 student student ${String(size).padStart(6)} ${shortDate(e.node.mtime)} ${e.name}`;
        }).join("\n");
        chunks.push(header + (entries.length ? `total ${entries.length}\n${body}\n` : ""));
      } else {
        chunks.push(header + (entries.length ? entries.map((e) => e.name).join("  ") + "\n" : ""));
      }
    }
    io.out(chunks.join("\n"));
    return status;
  },
  tree: (io, ctx) => {
    const root = abs(ctx, io.args[1] ?? ".");
    const walk = (path, prefix) => {
      const names = ctx.fs.list(path).filter((n) => !n.startsWith("."));
      names.forEach((name, i) => {
        const last = i === names.length - 1;
        const child = path === "/" ? "/" + name : path + "/" + name;
        io.out(`${prefix}${last ? "└── " : "├── "}${name}\n`);
        if (ctx.fs.isDir(child)) walk(child, prefix + (last ? "    " : "│   "));
      });
    };
    io.out(root + "\n");
    walk(root, "");
    return 0;
  },

  /* --------------------------- files ---------------------------- */
  mkdir: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    if (!rest.length) { io.err("mkdir: missing operand\n"); return 1; }
    let status = 0;
    for (const t of rest) { const err = ctx.fs.mkdir(abs(ctx, t), flags.has("p")); if (err) { io.err(`mkdir: ${err}\n`); status = 1; } }
    return status;
  },
  mkfifo: (io, ctx) => {
    const targets = io.args.slice(1).filter((a) => !a.startsWith("-"));
    if (!targets.length) { io.err("mkfifo: missing operand\n"); return 1; }
    let status = 0;
    for (const t of targets) {
      const err = ctx.fs.mkfifo(abs(ctx, t));
      if (err) { io.err(`mkfifo: ${err}\n`); status = 1; }
    }
    return status;
  },
  rmdir: (io, ctx) => {
    let status = 0;
    for (const t of io.args.slice(1)) {
      const path = abs(ctx, t);
      const node = ctx.fs.lookup(path);
      if (!node || node.type !== "dir") { io.err(`rmdir: failed to remove '${t}': Not a directory\n`); status = 1; continue; }
      if (Object.keys(node.children).length) { io.err(`rmdir: failed to remove '${t}': Directory not empty\n`); status = 1; continue; }
      ctx.fs.remove(path, true);
    }
    return status;
  },
  rm: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    if (!rest.length) { io.err("rm: missing operand\n"); return 1; }
    let status = 0;
    for (const t of rest) {
      const path = abs(ctx, t);
      const node = ctx.fs.lookup(path);
      if (!node) { if (!flags.has("f")) { io.err(`rm: cannot remove '${t}': No such file or directory\n`); status = 1; } continue; }
      if (node.type === "dir" && !(flags.has("r") || flags.has("R"))) { io.err(`rm: cannot remove '${t}': Is a directory\n`); status = 1; continue; }
      ctx.fs.remove(path, true);
    }
    return status;
  },
  touch: (io, ctx) => {
    for (const t of io.args.slice(1)) {
      const path = abs(ctx, t);
      const node = ctx.fs.lookup(path);
      if (node) node.mtime = Date.now();
      else { const err = ctx.fs.writeFile(path, ""); if (err) { io.err(`touch: ${err}\n`); return 1; } }
    }
    ctx.fs.persist();
    return 0;
  },
  cp: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    if (rest.length < 2) { io.err("cp: missing file operand\n"); return 1; }
    const destRaw = rest[rest.length - 1];
    const sources = rest.slice(0, -1);
    const destAbs = abs(ctx, destRaw);
    const destIsDir = ctx.fs.isDir(destAbs);
    for (const src of sources) {
      const target = destIsDir ? destAbs + "/" + src.split("/").pop() : destAbs;
      const err = ctx.fs.copy(abs(ctx, src), target, flags.has("r") || flags.has("R"));
      if (err) { io.err(`cp: ${err}\n`); return 1; }
    }
    return 0;
  },
  mv: (io, ctx) => {
    const rest = io.args.slice(1).filter((a) => !a.startsWith("-"));
    if (rest.length < 2) { io.err("mv: missing file operand\n"); return 1; }
    const destRaw = rest[rest.length - 1];
    const destAbs = abs(ctx, destRaw);
    const destIsDir = ctx.fs.isDir(destAbs);
    for (const src of rest.slice(0, -1)) {
      const target = destIsDir ? destAbs + "/" + src.split("/").pop() : destAbs;
      const err = ctx.fs.move(abs(ctx, src), target);
      if (err) { io.err(`mv: ${err}\n`); return 1; }
    }
    return 0;
  },
  cat: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    const { text, error } = inputText(io, ctx, rest);
    if (error) { io.err(`cat: ${error}: No such file or directory\n`); return 1; }
    if (flags.has("n")) { io.out(lines(text).map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join("\n") + "\n"); return 0; }
    io.out(text.endsWith("\n") || text === "" ? text : text + "\n");
    return 0;
  },
  head: (io, ctx) => {
    const args = io.args.slice(1); let n = 10; const files = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-n") n = Number(args[++i]) || 10;
      else if (/^-\d+$/.test(args[i])) n = Number(args[i].slice(1));
      else files.push(args[i]);
    }
    const { text } = inputText(io, ctx, files);
    io.out(lines(text).slice(0, n).join("\n") + "\n");
    return 0;
  },
  tail: (io, ctx) => {
    const args = io.args.slice(1); let n = 10; const files = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-n") n = Number(args[++i]) || 10;
      else if (/^-\d+$/.test(args[i])) n = Number(args[i].slice(1));
      else files.push(args[i]);
    }
    const { text } = inputText(io, ctx, files);
    io.out(lines(text).slice(-n).join("\n") + "\n");
    return 0;
  },
  wc: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    const { text, error } = inputText(io, ctx, rest);
    if (error) { io.err(`wc: ${error}: No such file or directory\n`); return 1; }
    const l = lines(text).length; const w = text.split(/\s+/).filter(Boolean).length; const c = text.length;
    const parts = [];
    if (flags.has("l")) parts.push(String(l));
    if (flags.has("w")) parts.push(String(w));
    if (flags.has("c") || flags.has("m")) parts.push(String(c));
    if (!parts.length) parts.push(String(l), String(w), String(c));
    io.out(parts.map((p) => p.padStart(flags.size ? 0 : 7)).join(" ") + (rest[0] ? " " + rest[0] : "") + "\n");
    return 0;
  },
  grep: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    const pattern = rest.shift();
    if (pattern === undefined) { io.err("Usage: grep [OPTION]... PATTERN [FILE]...\n"); return 2; }
    const re = new RegExp(pattern, flags.has("i") ? "i" : "");
    const multi = rest.length > 1;
    let matched = 0;
    const emit = (label, text) => {
      const ls = lines(text); let count = 0;
      ls.forEach((line, i) => {
        const hit = re.test(line);
        if (flags.has("v") ? !hit : hit) { count++; matched++; if (!flags.has("c")) io.out(`${multi ? label + ":" : ""}${flags.has("n") ? i + 1 + ":" : ""}${line}\n`); }
      });
      if (flags.has("c")) io.out(`${multi ? label + ":" : ""}${count}\n`);
    };
    if (!rest.length) emit("(standard input)", io.stdin);
    else for (const f of rest) {
      const content = ctx.fs.readFile(abs(ctx, f));
      if (content === null) { io.err(`grep: ${f}: No such file or directory\n`); continue; }
      emit(f, content);
    }
    return matched ? 0 : 1;
  },
  sort: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    const { text } = inputText(io, ctx, rest);
    let ls = lines(text);
    ls = flags.has("n") ? ls.sort((a, b) => Number(a) - Number(b)) : ls.sort((a, b) => a.localeCompare(b));
    if (flags.has("r")) ls.reverse();
    if (flags.has("u")) ls = ls.filter((l, i) => i === 0 || l !== ls[i - 1]);
    io.out(ls.join("\n") + (ls.length ? "\n" : ""));
    return 0;
  },
  uniq: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    const { text } = inputText(io, ctx, rest);
    const ls = lines(text); const out = []; let i = 0;
    while (i < ls.length) { let n = 1; while (i + n < ls.length && ls[i + n] === ls[i]) n++; out.push(flags.has("c") ? `${String(n).padStart(7)} ${ls[i]}` : ls[i]); i += n; }
    io.out(out.join("\n") + (out.length ? "\n" : ""));
    return 0;
  },
  cut: (io, ctx) => {
    const args = io.args.slice(1); let delim = "\t"; let fields = "1"; const files = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a.startsWith("-d")) delim = a.length > 2 ? a.slice(2).replace(/['"]/g, "") : args[++i] ?? "\t";
      else if (a.startsWith("-f")) fields = a.length > 2 ? a.slice(2) : args[++i] ?? "1";
      else if (a.startsWith("-c")) fields = a.length > 2 ? a.slice(2) : args[++i] ?? "1";
      else files.push(a);
    }
    const idx = fields.split(",").flatMap((f) => {
      const m = /^(\d+)-(\d+)$/.exec(f);
      if (m) { const out = []; for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i); return out; }
      return [Number(f)];
    });
    const { text } = inputText(io, ctx, files);
    io.out(lines(text).map((line) => { const parts = line.split(delim); return idx.map((i) => parts[i - 1] ?? "").join(delim); }).join("\n") + "\n");
    return 0;
  },
  tr: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    const expand = (s) => s.replace(/(\w)-(\w)/g, (_, a, b) => { let out = ""; for (let c = a.charCodeAt(0); c <= b.charCodeAt(0); c++) out += String.fromCharCode(c); return out; });
    const from = expand(rest[0] ?? ""); const to = expand(rest[1] ?? "");
    let text = io.stdin;
    if (flags.has("d")) text = [...text].filter((c) => !from.includes(c)).join("");
    else text = [...text].map((c) => (from.includes(c) ? to[Math.min(from.indexOf(c), to.length - 1)] ?? c : c)).join("");
    io.out(text);
    return 0;
  },
  sed: (io, ctx) => {
    const args = io.args.slice(1); const scripts = []; const files = []; let inPlace = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-e") scripts.push(args[++i] ?? "");
      else if (a === "-i" || a === "--in-place") inPlace = true;
      else if (a === "-n") continue;
      else if (!scripts.length && (a.startsWith("s") || a.startsWith("/"))) scripts.push(a);
      else files.push(a);
    }
    const apply = (text) => {
      let out = text;
      for (const script of scripts) {
        const m = /^s(.)(.*?)\1(.*?)\1([gi]*)$/.exec(script);
        if (m) { out = out.replace(new RegExp(m[2], "m" + (m[4].includes("g") ? "g" : "") + (m[4].includes("i") ? "i" : "")), m[3]); if (m[4].includes("g")) out = text.replace(new RegExp(m[2], "gm" + (m[4].includes("i") ? "i" : "")), m[3]); continue; }
        const d = /^\/(.*)\/$/.exec(script);
        if (d) out = lines(out).filter((l) => !new RegExp(d[1]).test(l)).join("\n") + "\n";
      }
      return out;
    };
    if (!files.length) { io.out(apply(io.stdin)); return 0; }
    for (const f of files) {
      const content = ctx.fs.readFile(abs(ctx, f));
      if (content === null) { io.err(`sed: can't read ${f}: No such file or directory\n`); return 1; }
      const result = apply(content);
      if (inPlace) ctx.fs.writeFile(abs(ctx, f), result);
      else io.out(result);
    }
    return 0;
  },
  awk: (io, ctx) => {
    const args = io.args.slice(1); let fs = " "; const rest = [];
    for (let i = 0; i < args.length; i++) { if (args[i] === "-F") fs = args[++i] ?? " "; else rest.push(args[i]); }
    const program = rest.shift() ?? "";
    const { text } = inputText(io, ctx, rest);
    const body = /\{([\s\S]*)\}/.exec(program)?.[1]?.trim() ?? "";
    const condition = program.split("{")[0]?.trim() ?? "";
    lines(text).forEach((line, i) => {
      const fields = fs === " " ? line.split(/\s+/).filter(Boolean) : line.split(fs);
      if (condition && !new RegExp(condition.replace(/^\/|\/$/g, "")).test(line)) return;
      const m = /^print\s*(.*)$/.exec(body);
      if (!m) return;
      const spec = m[1].trim();
      if (spec === "" || spec === "$0") { io.out(line + "\n"); return; }
      const out = spec.split(",").map((p) => {
        const t = p.trim();
        if (t === "NR") return String(i + 1);
        if (t === "NF") return String(fields.length);
        const f = /^\$(\d+)$/.exec(t);
        if (f) return fields[Number(f[1]) - 1] ?? "";
        return t.replace(/^"|"$/g, "");
      }).join(" ");
      io.out(out + "\n");
    });
    return 0;
  },
  tee: (io, ctx) => {
    const { flags, rest } = splitFlags(io.args.slice(1));
    for (const f of rest) { const path = abs(ctx, f); if (flags.has("a")) ctx.fs.appendFile(path, io.stdin); else ctx.fs.writeFile(path, io.stdin); }
    io.out(io.stdin);
    return 0;
  },
  find: (io, ctx) => {
    const args = io.args.slice(1);
    const start = args[0] && !args[0].startsWith("-") ? args.shift() : ".";
    let namePattern = null; let typeFilter = null;
    for (let i = 0; i < args.length; i++) { if (args[i] === "-name") namePattern = args[++i] ?? null; if (args[i] === "-type") typeFilter = args[++i] ?? null; }
    const root = abs(ctx, start);
    if (!ctx.fs.lookup(root)) { io.err(`find: '${start}': No such file or directory\n`); return 1; }
    for (const path of ctx.fs.walk(root)) {
      const name = path.split("/").pop() ?? "";
      if (namePattern && !matchGlob(namePattern, name)) continue;
      if (typeFilter === "f" && !ctx.fs.isFile(path)) continue;
      if (typeFilter === "d" && !ctx.fs.isDir(path)) continue;
      if (typeFilter === "p" && ctx.fs.lookup(path)?.type !== "fifo") continue;
      const rel = start === "." ? "." + path.slice(ctx.cwd === "/" ? 0 : ctx.cwd.length) : path;
      io.out((rel === "." ? "." : rel) + "\n");
    }
    return 0;
  },
  chmod: (io, ctx) => {
    // A symbolic mode may begin with `-` (for example `chmod -x file`), so it
    // must not go through the generic option splitter.
    const args = io.args.slice(1);
    if (args[0] === "--") args.shift();
    const modeArg = args.shift();
    if (!modeArg || !args.length) { io.err("chmod: missing operand\n"); return 1; }
    for (const f of args) {
      const path = abs(ctx, f); const node = ctx.fs.lookup(path);
      if (!node) { io.err(`chmod: cannot access '${f}': No such file or directory\n`); return 1; }
      let mode = node.mode;
      if (/^[0-7]{3,4}$/.test(modeArg)) mode = parseInt(modeArg, 8);
      else {
        const m = /^([ugoa]*)([+-=])([rwx]+)$/.exec(modeArg);
        if (m) {
          const who = m[1] || "a"; let mask = 0;
          if (m[3].includes("r")) mask |= 0o444;
          if (m[3].includes("w")) mask |= 0o222;
          if (m[3].includes("x")) mask |= 0o111;
          if (!who.includes("a")) { let filter = 0; if (who.includes("u")) filter |= 0o700; if (who.includes("g")) filter |= 0o070; if (who.includes("o")) filter |= 0o007; mask &= filter; }
          mode = m[2] === "+" ? mode | mask : m[2] === "-" ? mode & ~mask : mask;
        }
      }
      ctx.fs.chmod(path, mode);
    }
    return 0;
  },
  stat: (io, ctx) => {
    for (const f of io.args.slice(1)) {
      const path = abs(ctx, f); const node = ctx.fs.lookup(path);
      if (!node) { io.err(`stat: cannot statx '${f}': No such file or directory\n`); return 1; }
      const isFifo = node.type === "fifo";
      const isDir  = node.type === "dir";
      const size = isDir ? 4096 : isFifo ? 0 : node.content.length;
      const typeLabel = isDir ? "directory" : isFifo ? "fifo" : "regular file";
      io.out(`  File: ${f}\n  Size: ${size}\t\tBlocks: 8\t IO Block: 4096   ${typeLabel}\nAccess: (${(node.mode & 0o777).toString(8).padStart(4, "0")}/${modeString(node)})  Uid: ( 1000/student)   Gid: ( 1000/student)\nModify: ${new Date(node.mtime).toISOString()}\n`);
    }
    return 0;
  },
  file: (io, ctx) => {
    for (const f of io.args.slice(1)) {
      const node = ctx.fs.lookup(abs(ctx, f));
      if (!node) { io.out(`${f}: cannot open (No such file or directory)\n`); continue; }
      if (node.type === "dir")  { io.out(`${f}: directory\n`); continue; }
      if (node.type === "fifo") { io.out(`${f}: fifo (named pipe)\n`); continue; }
      if (node.content.startsWith("\u007fELF")) io.out(`${f}: ELF 64-bit LSB pie executable, x86-64, dynamically linked\n`);
      else if (node.content.startsWith("#!")) io.out(`${f}: Bourne-Again shell script, ASCII text executable\n`);
      else io.out(`${f}: ASCII text\n`);
    }
    return 0;
  },
  ln: (io, ctx) => {
    const rest = io.args.slice(1).filter((a) => !a.startsWith("-"));
    if (rest.length < 2) { io.err("ln: missing file operand\n"); return 1; }
    const err = ctx.fs.copy(abs(ctx, rest[0]), abs(ctx, rest[1]), true);
    if (err) { io.err(`ln: ${err}\n`); return 1; }
    return 0;
  },
  du: (io, ctx) => {
    const root = abs(ctx, io.args.slice(1).find((a) => !a.startsWith("-")) ?? ".");
    let total = 0;
    for (const p of ctx.fs.walk(root)) { const n = ctx.fs.lookup(p); if (n?.type === "file") total += Math.ceil(n.content.length / 1024) || 1; }
    io.out(`${total}\t${io.args[1] ?? "."}\n`);
    return 0;
  },
  df: (io) => { io.out(["Filesystem     1K-blocks    Used Available Use% Mounted on", "browsercache     5242880  102400   5140480   2% /", "tmpfs             1024000       0   1024000   0% /tmp", ""].join("\n")); return 0; },
  free: (io) => { io.out(["               total        used        free      shared  buff/cache   available", "Mem:         8039412     2103244     4512180      102400     1424000     5620112", "Swap:        2097148           0     2097148", ""].join("\n")); return 0; },

  /* ------------------------- text / misc ------------------------ */
  echo: (io) => {
    const args = io.args.slice(1); let newline = true; let escapes = false;
    while (args[0] === "-n" || args[0] === "-e" || args[0] === "-E") { if (args[0] === "-n") newline = false; if (args[0] === "-e") escapes = true; args.shift(); }
    const text = args.join(" ");
    io.out((escapes ? shellUnescape(text) : text) + (newline ? "\n" : ""));
    return 0;
  },
  printf: (io) => {
    const fmt = shellUnescape(io.args[1] ?? ""); const args = io.args.slice(2); let i = 0;
    io.out(fmt.replace(/%[-0-9.]*[sdifcx%]/g, (spec) => {
      if (spec.endsWith("%")) return "%";
      const a = args[i++] ?? "";
      if (spec.endsWith("d") || spec.endsWith("i")) return String(Math.trunc(Number(a) || 0));
      if (spec.endsWith("f")) { const prec = /\.(\d+)/.exec(spec)?.[1]; return (Number(a) || 0).toFixed(prec ? Number(prec) : 6); }
      return a;
    }));
    return 0;
  },
  seq: (io) => {
    const nums = io.args.slice(1).map(Number);
    const [a = 1, b, c] = nums;
    const start = nums.length === 1 ? 1 : a; const step = nums.length === 3 ? b : 1; const end = nums.length === 1 ? a : nums.length === 3 ? c : b;
    const out = [];
    if (step > 0) for (let i = start; i <= end; i += step) out.push(String(i));
    else if (step < 0) for (let i = start; i >= end; i += step) out.push(String(i));
    io.out(out.join("\n") + (out.length ? "\n" : ""));
    return 0;
  },
  expr: (io, ctx) => { const expr = io.args.slice(1).join(" "); const value = evalArith(expr.replace(/\\\*/g, "*"), ctx); io.out(value + "\n"); return value === 0 ? 1 : 0; },
  bc: (io, ctx) => { const text = io.stdin || io.args.slice(1).join(" "); for (const line of lines(text)) { if (!line.trim()) continue; io.out(evalArith(line, ctx) + "\n"); } return 0; },
  date: (io) => {
    const d = new Date(); const fmt = io.args[1];
    if (fmt?.startsWith("+")) {
      const pad = (n) => String(n).padStart(2, "0");
      io.out(fmt.slice(1).replace(/%Y/g, String(d.getFullYear())).replace(/%m/g, pad(d.getMonth() + 1)).replace(/%d/g, pad(d.getDate())).replace(/%H/g, pad(d.getHours())).replace(/%M/g, pad(d.getMinutes())).replace(/%S/g, pad(d.getSeconds())) + "\n");
      return 0;
    }
    io.out(d.toString().replace(/GMT.*/, "") + "\n");
    return 0;
  },
  cal: (io) => {
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
    const first = new Date(year, month, 1).getDay(); const days = new Date(year, month + 1, 0).getDate();
    const title = now.toLocaleString("en-US", { month: "long" }) + " " + year;
    io.out(title.padStart(Math.floor((20 + title.length) / 2)).padEnd(20) + "\n");
    io.out("Su Mo Tu We Th Fr Sa\n");
    let line = "   ".repeat(first);
    for (let d = 1; d <= days; d++) {
      line += String(d).padStart(2) + " ";
      if ((first + d) % 7 === 0) { io.out(line.trimEnd() + "\n"); line = ""; }
    }
    if (line.trim()) io.out(line.trimEnd() + "\n");
    return 0;
  },
  whoami: (io) => { io.out("student\n"); return 0; },
  id: (io) => { io.out("uid=1000(student) gid=1000(student) groups=1000(student),27(sudo)\n"); return 0; },
  hostname: (io) => { io.out("ubuntu\n"); return 0; },
  uname: (io) => {
    const { flags } = splitFlags(io.args.slice(1));
    if (flags.has("a")) io.out("Linux ubuntu 6.8.0-generic #1 SMP PREEMPT_DYNAMIC x86_64 x86_64 x86_64 GNU/Linux\n");
    else if (flags.has("r")) io.out("6.8.0-generic\n");
    else io.out("Linux\n");
    return 0;
  },
  uptime: (io) => { io.out(` ${new Date().toTimeString().slice(0, 8)} up 1:12,  1 user,  load average: 0.08, 0.03, 0.01\n`); return 0; },
  jobs: (io, ctx) => {
    const job = ctx.foregroundProcess;
    if (job?.suspended && !job.done) io.out(`[1]+  Stopped                 ${job.label}\n`);
    return 0;
  },
  fg: async (io, ctx) => {
    const job = ctx.foregroundProcess;
    if (!job || job.done) { io.err("bash: fg: current: no such job\n"); return 1; }
    io.out(`${job.label}\n`);
    job.resume();
    await job.waitForStopOrDone();
    return 0;
  },
  ps: (io) => {
    const { flags } = splitFlags(io.args.slice(1));
    const procs = globalProcessTable.snapshot();
    // Always include a bash entry for the shell itself
    const hasBash = procs.some((p) => p.name === "bash");
    const bashEntry = hasBash ? [] : [{ pid: 1024, ppid: 1, state: "S", name: "bash", cmd: "bash" }];
    const allProcs = [...bashEntry, ...procs.filter((p) => p.pid !== 1)];

    if (flags.has("e") || flags.has("l")) {
      // ps -el extended format: F S UID PID PPID ... CMD
      const header = "F S   UID     PID    PPID  C PRI  NI ADDR SZ WCHAN TTY          TIME CMD";
      const rows = allProcs.map((p) => {
        const state = p.state ?? "S";
        const pid   = String(p.pid).padStart(7);
        const ppid  = String(p.ppid).padStart(7);
        const cmd   = p.cmd ?? p.name ?? "?";
        return `4 ${state}  1000${pid}${ppid}  0  80   0 -  1234 -      pts/0    00:00:00 ${cmd}`;
      });
      io.out([header, ...rows, ""].join("\n"));
    } else {
      // ps basic format
      const header = "    PID TTY          TIME CMD";
      const rows = allProcs.map((p) => {
        const pid = String(p.pid).padStart(7);
        const cmd = p.cmd ?? p.name ?? "?";
        const state = p.state === "Z" ? " <defunct>" : "";
        return `${pid} pts/0    00:00:00 ${cmd}${state}`;
      });
      io.out([header, ...rows, ""].join("\n"));
    }
    return 0;
  },
  top: (io) => { io.out("top: this build is non-interactive; use `ps` instead.\n"); return 0; },
  clear: (_io, ctx) => { ctx.host.clear(); return 0; },
  sleep: async (io) => { const secs = Math.max(0, Number(io.args[1]) || 0); await new Promise((r) => setTimeout(r, secs * 1000)); return 0; },
  history: (io, ctx) => { ctx.history.forEach((h, i) => io.out(`${String(i + 1).padStart(5)}  ${h}\n`)); return 0; },
  which: (io, ctx) => {
    let status = 0;
    for (const name of io.args.slice(1)) {
      if (commands[name]) io.out(`/usr/bin/${name}\n`);
      else if (ctx.fs.isFile(abs(ctx, name))) io.out(abs(ctx, name) + "\n");
      else status = 1;
    }
    return status;
  },
  man: (io) => {
    const name = io.args[1];
    if (!name) { io.err("What manual page do you want?\n"); return 1; }
    io.out((MANPAGES[name] ?? `No manual entry for ${name}\n(try \`${name} --help\`)`) + "\n");
    return 0;
  },
  env: (io, ctx) => { for (const key of [...ctx.exported].sort()) io.out(`${key}=${ctx.vars[key] ?? ""}\n`); return 0; },
  printenv: (io, ctx) => {
    if (io.args[1]) { io.out((ctx.vars[io.args[1]] ?? "") + "\n"); return 0; }
    for (const key of [...ctx.exported].sort()) io.out(`${key}=${ctx.vars[key] ?? ""}\n`);
    return 0;
  },
  export: (io, ctx) => {
    for (const a of io.args.slice(1)) { const eq = a.indexOf("="); if (eq > 0) { ctx.vars[a.slice(0, eq)] = a.slice(eq + 1); ctx.exported.add(a.slice(0, eq)); } else ctx.exported.add(a); }
    return 0;
  },
  unset: (io, ctx) => { for (const a of io.args.slice(1)) { delete ctx.vars[a]; ctx.exported.delete(a); } return 0; },
  alias: (io, ctx) => {
    if (io.args.length === 1) { for (const [k, v] of Object.entries(ctx.aliases)) io.out(`alias ${k}='${v}'\n`); return 0; }
    for (const a of io.args.slice(1)) { const eq = a.indexOf("="); if (eq > 0) ctx.aliases[a.slice(0, eq)] = a.slice(eq + 1).replace(/^['"]|['"]$/g, ""); }
    return 0;
  },
  unalias: (io, ctx) => { for (const a of io.args.slice(1)) delete ctx.aliases[a]; return 0; },
  read: async (io, ctx) => {
    const args = io.args.slice(1); let prompt = ""; const names = [];
    for (let i = 0; i < args.length; i++) { if (args[i] === "-p") prompt = args[++i] ?? ""; else if (args[i].startsWith("-")) continue; else names.push(args[i]); }
    if (prompt) io.out(prompt);
    const line = await io.readLine();
    if (line === null) return 1;
    const parts = line.split(/\s+/);
    if (!names.length) ctx.vars["REPLY"] = line;
    names.forEach((n, i) => { ctx.vars[n] = i === names.length - 1 ? parts.slice(i).join(" ") : parts[i] ?? ""; });
    return 0;
  },
  test: (io, ctx) => runTest(io.args.slice(1), ctx),
  "[": (io, ctx) => { const args = io.args.slice(1); if (args[args.length - 1] === "]") args.pop(); return runTest(args, ctx); },
  "[[": (io, ctx) => { const args = io.args.slice(1); if (args[args.length - 1] === "]]") args.pop(); return runTest(args, ctx); },
  true: () => 0,
  false: () => 1,
  ":": () => 0,
  exit: (io, ctx) => { ctx.exiting = true; ctx.host.exit(); return Number(io.args[1]) || 0; },
  logout: (io, ctx) => { ctx.exiting = true; ctx.host.exit(); return 0; },
  basename: (io) => { const p = (io.args[1] ?? "").replace(/\/$/, ""); let name = p.split("/").pop() ?? ""; if (io.args[2] && name.endsWith(io.args[2])) name = name.slice(0, -io.args[2].length); io.out(name + "\n"); return 0; },
  dirname: (io) => { const p = (io.args[1] ?? "").replace(/\/$/, ""); const idx = p.lastIndexOf("/"); io.out((idx <= 0 ? (idx === 0 ? "/" : ".") : p.slice(0, idx)) + "\n"); return 0; },
  break: () => { throw new BreakSignal(); },
  continue: () => { throw new ContinueSignal(); },
  return: (io) => { throw new ReturnSignal(Number(io.args[1]) || 0); },
  shift: (io, ctx) => { const n = Number(ctx.vars["#"] ?? 0); for (let i = 1; i < n; i++) ctx.vars[String(i)] = ctx.vars[String(i + 1)] ?? ""; delete ctx.vars[String(n)]; ctx.vars["#"] = String(Math.max(0, n - 1)); return 0; },
  source: (io, ctx) => sourceFile(io, ctx),
  ".": (io, ctx) => sourceFile(io, ctx),
  bash: (io, ctx) => runInterpreter(io, ctx),
  sh: (io, ctx) => runInterpreter(io, ctx),

  /* ------------------------- editors ---------------------------- */
  nano: (io, ctx) => openEditor(io, ctx, "nano"),
  vi: (io, ctx) => openEditor(io, ctx, "vi"),
  vim: (io, ctx) => openEditor(io, ctx, "vim"),
  gedit: (io, ctx) => openEditor(io, ctx, "gedit"),

  /* ------------------------- toolchain -------------------------- */
  gcc: (io, ctx) => compileC(io, ctx, "gcc"),
  cc: (io, ctx) => compileC(io, ctx, "cc"),
  "g++": (io, ctx) => compileC(io, ctx, "g++"),
  make: (io, ctx) => {
    const mf = ctx.fs.readFile(abs(ctx, "Makefile")) ?? ctx.fs.readFile(abs(ctx, "makefile"));
    if (mf === null) { io.err("make: *** No targets specified and no makefile found.  Stop.\n"); return 2; }
    io.out("make: nothing to be done (this classroom build only parses simple Makefiles)\n");
    return 0;
  },
  sudo: async (io, ctx) => {
    const rest = io.args.slice(1);
    if (!rest.length) { io.err("usage: sudo command\n"); return 1; }
    const cmd = commands[rest[0]];
    if (!cmd) { io.err(`sudo: ${rest[0]}: command not found\n`); return 127; }
    return cmd({ ...io, args: rest }, ctx);
  },
  apt: (io) => { io.err("apt: package management is not available in the cached shell.\nRun `ubuntu-vm` to boot the full Ubuntu machine where apt works.\n"); return 1; },
  "apt-get": (io) => { io.err("apt-get: not available here. Run `ubuntu-vm` for the full Ubuntu machine.\n"); return 1; },
  python3: (io) => { io.err("python3: not installed in the cached shell. Run `ubuntu-vm` for the full Ubuntu machine.\n"); return 127; },
  "ubuntu-vm": (io, ctx) => { io.out("Requesting the full Ubuntu virtual machine...\n"); ctx.host.bootRealUbuntu(); return 0; },
  reset: (_io, ctx) => { ctx.host.clear(); return 0; },
  "factory-reset": (io, ctx) => { ctx.fs.reset(); ctx.cwd = HOME; io.out("Cached filesystem restored to defaults.\n"); return 0; },
  help: (io) => {
    const names = Object.keys(commands).sort();
    io.out("GNU bash, version 5.2.21(1)-release (browser build)\n\nAvailable commands:\n");
    for (let i = 0; i < names.length; i += 6) io.out("  " + names.slice(i, i + 6).map((n) => n.padEnd(12)).join("") + "\n");
    io.out("\nRun `ubuntu-vm` to boot a full Ubuntu machine with apt, python3 and real gcc.\n");
    return 0;
  },
};

function sourceFile(io, ctx) {
  const target = io.args[1];
  if (!target) { io.err("source: filename argument required\n"); return 2; }
  const content = ctx.fs.readFile(abs(ctx, target));
  if (content === null) { io.err(`bash: ${target}: No such file or directory\n`); return 1; }
  return runScript(content, { ...io, args: [target, ...io.args.slice(2)] }, ctx);
}

function runInterpreter(io, ctx) {
  const args = io.args.slice(1).filter((a) => a !== "-x" && a !== "-e");
  if (args[0] === "-c") return runScript(args.slice(1).join(" "), { ...io, args: ["bash"] }, ctx);
  const target = args[0];
  if (!target) { io.err("bash: nested interactive shells are not supported here\n"); return 1; }
  const content = ctx.fs.readFile(abs(ctx, target));
  if (content === null) { io.err(`bash: ${target}: No such file or directory\n`); return 127; }
  return runScript(content, { ...io, args }, ctx);
}

function openEditor(io, ctx, name) {
  const target = io.args[1];
  if (!target) { io.err(`${name}: please give a filename, e.g. ${name} script.sh\n`); return 1; }
  const path = abs(ctx, target);
  if (!ctx.fs.lookup(path)) ctx.fs.writeFile(path, "");
  window.dispatchEvent(new CustomEvent("ubuntu-terminal-edit", { detail: { path, instanceId: ctx.instanceId ?? 0 } }));
  return 0;
}

function compileC(io, ctx, tool) {
  const args = io.args.slice(1); let output = "a.out"; const sources = [];
  for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "-o") output = args[++i] ?? "a.out"; else if (a.startsWith("-")) continue; else sources.push(a); }
  if (!sources.length) { io.err(`${tool}: fatal error: no input files\ncompilation terminated.\n`); return 1; }
  const parts = [];
  for (const src of sources) { const content = ctx.fs.readFile(abs(ctx, src)); if (content === null) { io.err(`${tool}: error: ${src}: No such file or directory\n`); return 1; } parts.push(content); }
  const source = parts.join("\n");
  const errors = checkC(source, sources[0]);
  if (errors.length) { io.err(errors.join("\n") + "\ncollect2: error: ld returned 1 exit status\n"); return 1; }
  const err = ctx.fs.writeFile(abs(ctx, output), makeBinary(source), 0o755);
  if (err) { io.err(`${tool}: ${err}\n`); return 1; }
  return 0;
}

function runTest(args, ctx) {
  const ok = (b) => (b ? 0 : 1);
  if (args.length === 0) return 1;
  if (args[0] === "!") return runTest(args.slice(1), ctx) === 0 ? 1 : 0;
  if (args.length === 1) return ok(args[0] !== "");
  if (args.length === 2) {
    const [op, target] = args;
    const path = abs(ctx, target); const node = ctx.fs.lookup(path);
    switch (op) {
      case "-e": return ok(!!node);
      case "-f": return ok(node?.type === "file");
      case "-d": return ok(node?.type === "dir");
      case "-s": return ok(node?.type === "file" && node.content.length > 0);
      case "-r": case "-w": return ok(!!node);
      case "-x": return ok(!!node && (node.mode & 0o111) !== 0);
      case "-z": return ok(target === "");
      case "-n": return ok(target !== "");
      default: return 1;
    }
  }
  const [l, op, r] = args;
  switch (op) {
    case "=": case "==": return ok(matchGlob(r, l) || l === r);
    case "!=": return ok(l !== r);
    case "=~": {
      try { return ok(new RegExp(r).test(l)); }
      catch { return 2; }
    }
    case "-eq": return ok(Number(l) === Number(r));
    case "-ne": return ok(Number(l) !== Number(r));
    case "-lt": return ok(Number(l) < Number(r));
    case "-le": return ok(Number(l) <= Number(r));
    case "-gt": return ok(Number(l) > Number(r));
    case "-ge": return ok(Number(l) >= Number(r));
    case "-a": return ok(runTest([l], ctx) === 0 && runTest(args.slice(2), ctx) === 0);
    case "-o": return ok(runTest([l], ctx) === 0 || runTest(args.slice(2), ctx) === 0);
    case "<": return ok(l < r);
    case ">": return ok(l > r);
    default: return 1;
  }
}
