import { HOME, VFS } from "./fs.js";

export function createSession(host, sharedFs = null, instanceId = 0) {
  const fs = sharedFs ?? new VFS();
  const vars = {
    HOME,
    PWD: HOME,
    OLDPWD: HOME,
    USER: "student",
    LOGNAME: "student",
    SHELL: "/bin/bash",
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOSTNAME: "ubuntu",
    LANG: "en_US.UTF-8",
    TERM: "xterm-256color",
    PS1: "\\u@\\h:\\w\\$ ",
    "0": "bash",
    "#": "0",
    "@": "",
  };
  return {
    fs,
    cwd: HOME,
    vars,
    exported: new Set(["HOME", "PWD", "USER", "SHELL", "PATH", "HOSTNAME", "LANG", "TERM", "LOGNAME"]),
    aliases: { ll: "ls -l", la: "ls -a", "l.": "ls -a", cls: "clear" },
    funcs: {},
    history: [],
    status: 0,
    exiting: false,
    foregroundProcess: null,
    host,
    instanceId,
  };
}

export function displayPath(cwd) {
  if (cwd === HOME) return "~";
  if (cwd.startsWith(HOME + "/")) return "~" + cwd.slice(HOME.length);
  return cwd;
}
