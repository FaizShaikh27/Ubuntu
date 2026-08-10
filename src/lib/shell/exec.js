import { CInterpreter } from "./minic.js";
import { execNode, parse } from "./interpreter.js";
import { globalProcessTable } from "./process-table.js";

export const BINARY_MAGIC = "\u007fELF\u0002MINIC-C\n";

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

    const interp = new CInterpreter(
      { out: io.out, err: io.err, readLine: io.readLine },
      {
        pid,
        ppid: 1,
        processTable: globalProcessTable,
        execName,
      }
    );
    try {
      interp.load(content.slice(BINARY_MAGIC.length));
    } catch (e) {
      io.err(`Segmentation fault (${e.message})\n`);
      return 139;
    }
    return interp.run(io.args);
  }
  return runScript(content, io, ctx);
}
