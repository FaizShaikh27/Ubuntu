// Virtual filesystem persisted in browser cache (localStorage).

const STORAGE_KEY = "ubuntu-terminal-fs-v1";

export const HOME = "/home/student";

function dir(children = {}) {
  return { type: "dir", children, mode: 0o755, mtime: Date.now() };
}

export function file(content = "", mode = 0o644) {
  return { type: "file", content, mode, mtime: Date.now() };
}

function defaultRoot() {
  return dir({
    bin: dir(),
    boot: dir(),
    dev: dir({ null: file(""), zero: file("") }),
    etc: dir({
      hostname: file("ubuntu\n"),
      "os-release": file(
        [
          'PRETTY_NAME="Ubuntu 24.04.1 LTS"',
          'NAME="Ubuntu"',
          'VERSION_ID="24.04"',
          'VERSION="24.04.1 LTS (Noble Numbat)"',
          "ID=ubuntu",
          "ID_LIKE=debian",
          "",
        ].join("\n"),
      ),
      passwd: file(
        ["root:x:0:0:root:/root:/bin/bash", "student:x:1000:1000:Student:/home/student:/bin/bash", ""].join("\n"),
      ),
      group: file(["root:x:0:", "student:x:1000:", ""].join("\n")),
    }),
    home: dir({
      student: dir({
        "welcome.txt": file(
          [
            "Welcome to the Ubuntu Terminal for students.",
            "",
            "Everything you create here is cached in your browser,",
            "so your files survive a page reload.",
            "",
            "Try: ls, cat welcome.txt, nano hello.sh, gcc hello.c -o hello",
            "",
          ].join("\n"),
        ),
        "hello.c": file(
          [
            "#include <stdio.h>",
            "",
            "int main() {",
            '    printf("Hello, Ubuntu!\\n");',
            "    return 0;",
            "}",
            "",
          ].join("\n"),
        ),
        "hello.sh": file(
          [
            "#!/bin/bash",
            "# A tiny shell script",
            'for i in 1 2 3; do',
            '    echo "Iteration $i"',
            "done",
            "",
          ].join("\n"),
          0o755,
        ),
      }),
    }),
    lib: dir(),
    media: dir(),
    mnt: dir(),
    opt: dir(),
    proc: dir({ cpuinfo: file("model name\t: Virtual CPU\n"), version: file("Linux version 6.8.0-generic\n") }),
    root: dir(),
    run: dir(),
    sbin: dir(),
    srv: dir(),
    sys: dir(),
    tmp: dir(),
    usr: dir({ bin: dir(), lib: dir(), local: dir({ bin: dir() }), share: dir() }),
    var: dir({ log: dir({ syslog: file("") }), tmp: dir() }),
  });
}

export class VFS {
  constructor() {
    this.root = this.load();
  }

  load() {
    if (typeof window === "undefined") return defaultRoot();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.type === "dir") return parsed;
      }
    } catch {
      /* corrupted cache: fall back to a fresh tree */
    }
    return defaultRoot();
  }

  persist() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.root));
    } catch {
      /* quota exceeded: keep working in memory */
    }
  }

  reset() {
    this.root = defaultRoot();
    this.persist();
  }

  /**
   * Merge a public file tree (from /api/terminal-files) into a target VFS
   * directory. Public (teacher-provided) files are ALWAYS written so that
   * restoring a file to public/terminal-files/ is immediately reflected in
   * every user's terminal. Directories and user-created files outside the
   * public tree are left untouched.
   *
   * @param {object} publicTree  — JSON tree from the API  { type, children }
   * @param {string} targetPath  — absolute VFS path to merge into (e.g. "/home/student")
   */
  mergePublic(publicTree, targetPath = "/home/student") {
    if (!publicTree || publicTree.type !== "dir") return;
    this._mergeNode(publicTree, targetPath);
    this.persist();
  }

  /** Recursive helper for mergePublic. */
  _mergeNode(node, vfsPath) {
    if (node.type === "dir") {
      // Ensure the directory exists in the VFS
      if (!this.lookup(vfsPath)) {
        this.mkdir(vfsPath, true);
      }
      for (const [name, child] of Object.entries(node.children ?? {})) {
        this._mergeNode(child, (vfsPath === "/" ? "" : vfsPath) + "/" + name);
      }
    } else if (node.type === "file") {
      // Always write public files so restored/updated files are visible immediately.
      // This ensures teacher-provided files are always in sync with the server.
      const isExec = node.content?.startsWith("#!/") || vfsPath.endsWith(".sh");
      const mode = isExec ? 0o755 : 0o644;
      this.writeFile(vfsPath, node.content ?? "", mode);
    }
  }


  normalize(path, cwd) {
    let p = path;
    if (!p.startsWith("/")) p = cwd.replace(/\/$/, "") + "/" + p;
    const parts = p.split("/");
    const out = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        out.pop();
        continue;
      }
      out.push(part);
    }
    return "/" + out.join("/");
  }

  lookup(abs) {
    if (abs === "/") return this.root;
    const parts = abs.split("/").filter(Boolean);
    let node = this.root;
    for (const part of parts) {
      if (node.type !== "dir") return null;
      const next = node.children[part];
      if (!next) return null;
      node = next;
    }
    return node;
  }

  parentOf(abs) {
    const parts = abs.split("/").filter(Boolean);
    const name = parts.pop() ?? "";
    const parentPath = "/" + parts.join("/");
    const parent = this.lookup(parentPath);
    return { parent: parent && parent.type === "dir" ? parent : null, name };
  }

  isDir(abs) {
    return this.lookup(abs)?.type === "dir";
  }

  isFile(abs) {
    return this.lookup(abs)?.type === "file";
  }

  readFile(abs) {
    const node = this.lookup(abs);
    return node && node.type === "file" ? node.content : null;
  }

  writeFile(abs, content, mode) {
    const { parent, name } = this.parentOf(abs);
    if (!parent) return `cannot create '${abs}': No such file or directory`;
    const existing = parent.children[name];
    if (existing && existing.type === "dir") return `cannot write '${abs}': Is a directory`;
    if (existing && existing.type === "file") {
      existing.content = content;
      existing.mtime = Date.now();
      if (mode !== undefined) existing.mode = mode;
    } else {
      parent.children[name] = file(content, mode ?? 0o644);
    }
    this.persist();
    return null;
  }

  appendFile(abs, content) {
    const prev = this.readFile(abs) ?? "";
    return this.writeFile(abs, prev + content);
  }

  mkdir(abs, parents = false) {
    if (this.lookup(abs)) {
      if (parents) return null;
      return `cannot create directory '${abs}': File exists`;
    }
    const { parent, name } = this.parentOf(abs);
    if (!parent) {
      if (!parents) return `cannot create directory '${abs}': No such file or directory`;
      const parentPath = abs.slice(0, abs.lastIndexOf("/")) || "/";
      const err = this.mkdir(parentPath, true);
      if (err) return err;
      return this.mkdir(abs, parents);
    }
    parent.children[name] = dir();
    this.persist();
    return null;
  }

  remove(abs, recursive = false) {
    const node = this.lookup(abs);
    if (!node) return `cannot remove '${abs}': No such file or directory`;
    if (node.type === "dir" && !recursive && Object.keys(node.children).length > 0)
      return `cannot remove '${abs}': Directory not empty`;
    if (node.type === "dir" && !recursive) {
      // empty dir with rmdir semantics handled by caller
    }
    const { parent, name } = this.parentOf(abs);
    if (!parent) return `cannot remove '${abs}': Permission denied`;
    delete parent.children[name];
    this.persist();
    return null;
  }

  list(abs) {
    const node = this.lookup(abs);
    if (!node) return [];
    if (node.type === "file") return [abs.split("/").pop() ?? abs];
    return Object.keys(node.children).sort((a, b) => a.localeCompare(b));
  }

  copy(src, dest, recursive = false) {
    const node = this.lookup(src);
    if (!node) return `cannot stat '${src}': No such file or directory`;
    if (node.type === "dir" && !recursive) return `-r not specified; omitting directory '${src}'`;
    const clone = JSON.parse(JSON.stringify(node));
    const { parent, name } = this.parentOf(dest);
    if (!parent) return `cannot create '${dest}': No such file or directory`;
    parent.children[name] = clone;
    this.persist();
    return null;
  }

  move(src, dest) {
    const err = this.copy(src, dest, true);
    if (err) return err;
    return this.remove(src, true);
  }

  chmod(abs, mode) {
    const node = this.lookup(abs);
    if (!node) return `cannot access '${abs}': No such file or directory`;
    node.mode = mode;
    this.persist();
    return null;
  }

  walk(abs, out = []) {
    const node = this.lookup(abs);
    if (!node) return out;
    out.push(abs);
    if (node.type === "dir") {
      for (const name of Object.keys(node.children).sort()) {
        this.walk((abs === "/" ? "" : abs) + "/" + name, out);
      }
    }
    return out;
  }
}

export function modeString(node) {
  const perms = node.mode & 0o777;
  const rwx = (bits) =>
    (bits & 4 ? "r" : "-") + (bits & 2 ? "w" : "-") + (bits & 1 ? "x" : "-");
  return (
    (node.type === "dir" ? "d" : "-") +
    rwx((perms >> 6) & 7) +
    rwx((perms >> 3) & 7) +
    rwx(perms & 7)
  );
}

export function shortDate(ms) {
  const d = new Date(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${months[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
