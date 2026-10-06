// Educational Unix stream sockets and System V shared memory. A shared VFS
// represents one machine; split terminal panes use the same IPC namespace.
const machines = new WeakMap();
const fallbackMachine = {};
function machine(fs) {
  const key = fs ?? fallbackMachine;
  if (!machines.has(key)) machines.set(key, { sockets: new Map(), segments: new Map(), nextId: 1 });
  return machines.get(key);
}

function closeSocket(socket) {
  socket.closed = true;
  for (const pending of socket.pending ?? []) closeSocket(pending);
  if (socket.pending) socket.pending.length = 0;
}

export function cleanupIPC(interp) {
  for (const entry of interp._fdTable.values()) {
    if (entry.type === "socket") closeSocket(entry);
  }
  for (const segment of interp._shmAttachments ?? []) segment.attachments--;
  interp._shmAttachments = [];
  const state = machine(interp.vfs);
  for (const [id, segment] of state.segments) {
    if (segment.removed && segment.attachments === 0) state.segments.delete(id);
  }
}

const calls = new Set(["socket", "bind", "listen", "accept", "connect", "unlink", "ftok", "shmget", "shmat", "shmdt", "shmctl"]);

export async function callIPC(interp, name, exprs, { toNum, toStr }, evaluatedArgs = null) {
  // read/write/close dispatch here only for socket descriptors. Their arguments
  // were evaluated by minic.js and must not run twice (for example fd++).
  if (!calls.has(name) && !evaluatedArgs) return undefined;
  const args = evaluatedArgs ?? [];
  if (!evaluatedArgs) for (const expr of exprs) args.push(await interp.eval(expr));
  const state = machine(interp.vfs);
  const fail = (errno) => { interp._lastErrno = errno; return -1; };
  const pathOf = (value) => interp.vfs?.normalize(toStr(value), interp.cwd) ?? toStr(value);
  const alloc = (entry) => {
    const fd = interp._nextFd++;
    interp._fdTable.set(fd, entry);
    return fd;
  };
  const endpoint = () => ({ type: "socket", bytes: [], closed: false, peer: null, pending: [] });
  const waitUntil = async (ready) => {
    while (!ready()) {
      await interp.control?.checkpoint();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await interp.control?.checkpoint();
  };
  const socket = interp._fdTable.get(toNum(args[0]));

  switch (name) {
    case "socket":
      if (toNum(args[0]) !== 1 || toNum(args[1]) !== 1 || toNum(args[2]) !== 0) return fail(22);
      return alloc(endpoint());
    case "bind": {
      if (socket?.type !== "socket" || socket.closed) return fail(9);
      if (socket.path || toNum(args[1]?.sun_family) !== 1) return fail(22);
      const address = toStr(args[1]?.sun_path);
      if (!address || address.length > 107) return fail(22);
      const path = pathOf(address);
      if (state.sockets.has(path) || interp.vfs?.lookup(path)) return fail(98);
      if (interp.vfs) {
        if (interp.vfs.writeFile(path, "")) return fail(2);
        interp.vfs.lookup(path).type = "socket";
      }
      socket.path = path;
      state.sockets.set(path, socket);
      return 0;
    }
    case "listen":
      if (socket?.type !== "socket" || !socket.path || socket.closed) return fail(22);
      socket.listening = true;
      socket.backlog = Math.max(1, toNum(args[1]));
      return 0;
    case "connect": {
      if (socket?.type !== "socket" || socket.closed) return fail(9);
      if (socket.peer || toNum(args[1]?.sun_family) !== 1) return fail(22);
      const path = pathOf(args[1]?.sun_path);
      const server = state.sockets.get(path);
      if (!server) return fail(interp.vfs?.lookup(path) ? 111 : 2);
      if (server.closed || !server.listening || server.pending.length >= server.backlog) return fail(111);
      const accepted = endpoint();
      accepted.peer = socket;
      socket.peer = accepted;
      server.pending.push(accepted);
      return 0;
    }
    case "accept":
      if (socket?.type !== "socket" || !socket.listening || socket.closed) return fail(22);
      await waitUntil(() => socket.pending.length > 0 || socket.closed);
      return socket.closed ? fail(9) : alloc(socket.pending.shift());
    case "read": {
      const count = toNum(args[2]);
      if (count < 0 || !args[1]?.__array) return fail(22);
      if (count === 0) return 0;
      if (!socket.peer) return fail(107);
      await waitUntil(() => socket.bytes.length > 0 || socket.peer.closed || socket.closed);
      if (socket.closed) return fail(9);
      const bytes = socket.bytes.splice(0, count);
      bytes.forEach((byte, index) => { args[1].__array[index] = byte; });
      return bytes.length;
    }
    case "write": {
      if (!socket.peer) return fail(107);
      if (socket.peer.closed) return fail(32);
      const count = toNum(args[2]);
      if (count < 0) return fail(22);
      const bytes = args[1]?.__array ?? Array.from(toStr(args[1]), (char) => char.charCodeAt(0));
      const chunk = bytes.slice(0, count);
      for (const byte of chunk) socket.peer.bytes.push(byte);
      return chunk.length;
    }
    case "close":
      closeSocket(socket);
      interp._fdTable.delete(toNum(args[0]));
      return 0;
    case "unlink": {
      const path = pathOf(args[0]);
      const node = interp.vfs?.lookup(path);
      if (node?.type === "dir") return fail(21);
      if (!node && !state.sockets.has(path)) return fail(2);
      state.sockets.delete(path);
      if (node) interp.vfs.remove(path);
      return 0;
    }
    case "ftok": {
      const path = pathOf(args[0]);
      if (!interp.vfs?.lookup(path)) return fail(2);
      // Stable within this virtual machine, including the low project-id byte.
      let hash = 0;
      for (const char of path) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) & 0xffffff;
      return ((toNum(args[1]) & 255) << 24 | hash) >>> 0;
    }
    case "shmget": {
      const key = toNum(args[0]), size = toNum(args[1]), flags = toNum(args[2]);
      const existing = [...state.segments.values()].find((s) => key !== 0 && s.key === key && !s.removed);
      if (existing) {
        if ((flags & 0o3000) === 0o3000) return fail(17);
        return size > existing.data.__array.length ? fail(22) : existing.id;
      }
      if (key !== 0 && !(flags & 0o1000)) return fail(2);
      // Bound memory allocation in the browser simulator.
      if (size < 1 || size > 1048576) return fail(22);
      const id = state.nextId++;
      state.segments.set(id, { id, key, data: { __array: new Array(size).fill(0) }, attachments: 0, removed: false });
      return id;
    }
    case "shmat": {
      const segment = state.segments.get(toNum(args[0]));
      if (!segment || segment.removed || toNum(args[1]) !== 0 || toNum(args[2]) !== 0) return fail(22);
      segment.attachments++;
      (interp._shmAttachments ??= []).push(segment);
      return segment.data;
    }
    case "shmdt": {
      const attachments = interp._shmAttachments ?? [];
      const index = attachments.findIndex((s) => s.data === args[0]);
      if (index < 0) return fail(22);
      const [segment] = attachments.splice(index, 1);
      segment.attachments--;
      if (segment.removed && segment.attachments === 0) state.segments.delete(segment.id);
      return 0;
    }
    case "shmctl": {
      const segment = state.segments.get(toNum(args[0]));
      if (!segment || toNum(args[1]) !== 0) return fail(22);
      segment.removed = true;
      if (segment.attachments === 0) state.segments.delete(segment.id);
      return 0;
    }
    default: return undefined;
  }
}

