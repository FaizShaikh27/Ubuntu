import { CInterpreter, ProcessInterrupted } from "./minic.js";
import { execNode, parse } from "./interpreter.js";
import { globalProcessTable } from "./process-table.js";

export const BINARY_MAGIC = "\u007fELF\u0002MINIC-C\n";

function createProcessControl(label) {
  let resumeResolver = null;
  const stopWaiters = new Set();
  const control = {
    label,
    interpreter: null,
    suspended: false,
    interrupted: false,
    done: false,
    pause() {
      if (control.done || control.suspended) return;
      control.suspended = true;
      for (const resolve of stopWaiters) resolve("stopped");
      stopWaiters.clear();
    },
    async sendSignal(signalNumber) {
      return control.interpreter?.deliverSignal(signalNumber);
    },
    resume() {
      if (control.done || !control.suspended) return;
      control.suspended = false;
      const resolve = resumeResolver;
      resumeResolver = null;
      resolve?.();
      void control.interpreter?.deliverSignal(18);
    },
    interrupt() {
      if (control.done) return;
      control.interrupted = true;
      control.suspended = false;
      const resolve = resumeResolver;
      resumeResolver = null;
      resolve?.();
    },
    async checkpoint() {
      if (control.interrupted) throw new ProcessInterrupted();
      if (control.suspended) {
        await new Promise((resolve) => { resumeResolver = resolve; });
        if (control.interrupted) throw new ProcessInterrupted();
      }
    },
    waitForStopOrDone() {
      if (control.suspended) return Promise.resolve("stopped");
      if (control.done) return Promise.resolve("done");
      return new Promise((resolve) => stopWaiters.add(resolve));
    },
    finish() {
      control.done = true;
      for (const resolve of stopWaiters) resolve("done");
      stopWaiters.clear();
    },
  };
  return control;
}

export function makeBinary(source) {
  return BINARY_MAGIC + source;
}

export async function runScript(source, io, ctx) {
  const saved = { ...ctx.vars };
  io.args.slice(1).forEach((a, i) => (ctx.vars[String(i + 1)] = a));
  ctx.vars["#"] = String(io.args.length - 1);
  ctx.vars["@"] = io.args.slice(1).join(" ");
  ctx.vars["0"] = io.args[0];
  try {
    return await execNode(parse(source), ctx, { out: io.out, err: io.err, stdin: io.stdin });
  } catch (e) {
    io.err(`bash: ${e.message}\n`);
    return 2;
  } finally {
    ctx.vars = { ...saved };
  }
}

export async function runExecutable(path, io, ctx) {
  const abs = ctx.fs.normalize(path, ctx.cwd);
  const node = ctx.fs.lookup(abs);
  if (!node) {
    io.err(`bash: ${path}: No such file or directory\n`);
    return 127;
  }
  if (node.type === "dir") {
    io.err(`bash: ${path}: Is a directory\n`);
    return 126;
  }
  if ((node.mode & 0o111) === 0) {
    io.err(`bash: ${path}: Permission denied\n`);
    return 126;
  }
  const content = node.content;
  if (content.startsWith(BINARY_MAGIC)) {
    // Derive the executable name from the path for ps output
    const execName = path.split("/").pop() ?? "a.out";

    // Reset the process table for a fresh program run so we don't accumulate
    // stale entries from previous executions in the same terminal session.
    globalProcessTable.reset();

    // Allocate a PID for this process (parent = init, PID 1)
    const pid = globalProcessTable.alloc(1, execName);

    const control = createProcessControl(execName);
    const interp = new CInterpreter(
      { out: io.out, err: io.err, readLine: io.readLine },
      {
        pid,
        ppid: 1,
        processTable: globalProcessTable,
        execName,
        fs:  ctx.fs,
        cwd: ctx.cwd,
        control,
      }
    );
    control.interpreter = interp;
    ctx.foregroundProcess = control;
    try {
      interp.load(content.slice(BINARY_MAGIC.length));
    } catch (e) {
      io.err(`Segmentation fault (${e.message})\n`);
      control.finish();
      if (ctx.foregroundProcess === control) ctx.foregroundProcess = null;
      return 139;
    }
    try {
      return await interp.run(io.args);
    } finally {
      control.finish();
      if (ctx.foregroundProcess === control) ctx.foregroundProcess = null;
    }
  }
  return runScript(content, io, ctx);
}
