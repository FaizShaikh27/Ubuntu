import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { VFS } from "../src/lib/shell/fs.js";
import { createSession } from "../src/lib/shell/session.js";
import { commands } from "../src/lib/shell/commands.js";
import { runExecutable } from "../src/lib/shell/exec.js";

function publicTree(path) {
  return { type: "dir", children: Object.fromEntries(readdirSync(path, { withFileTypes: true }).map((entry) => [
    entry.name, entry.isDirectory() ? publicTree(path + "/" + entry.name) : { type: "file", content: readFileSync(path + "/" + entry.name, "utf8") },
  ])) };
}
function setup(fs = new VFS()) {
  fs.mergePublic(publicTree("public/terminal-files"));
  const ctx = createSession({}, fs);
  let output = "", errors = "";
  const io = { out: (s) => { output += s; }, err: (s) => { errors += s; }, readLine: async () => null, stdin: "" };
  return {
    ctx, fs, io,
    get output() { return output; }, get errors() { return errors; },
    compile(source, binary) {
      const status = commands.gcc({ ...io, args: ["gcc", source, "-o", binary] }, ctx);
      assert.equal(status, 0, errors);
      assert.ok(fs.lookup(fs.normalize(binary, ctx.cwd)).mode & 0o111);
    },
    run(binary) { return runExecutable(binary, { ...io, args: [binary] }, ctx); },
    source(name, content) { fs.writeFile(ctx.cwd + "/" + name + ".c", content); this.compile(name + ".c", name); },
  };
}
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("Timed out waiting for program progress");
}

test("practical 11 exchanges real data across panes and can run twice", { timeout: 5000 }, async () => {
  const server = setup(), client = setup(server.fs);
  server.ctx.cwd = client.ctx.cwd = "/home/student/practicals/practical11";
  server.compile("server.c", "server");
  client.compile("client.c", "client");
  for (let i = 0; i < 2; i++) {
    const running = server.run("./server");
    await until(() => server.output.split("Server is listening").length === i + 2);
    assert.equal(await client.run("./client"), 0, client.errors);
    assert.equal(await running, 0, server.errors);
    assert.equal(server.fs.lookup("/tmp/unix_socket"), null);
  }
  assert.equal(server.errors + client.errors, "");
  assert.match(server.output, /Received from client: Hello from client!/);
  assert.match(client.output, /Received from server: Hello from server!/);
});

test("client without a server fails and waiting accept is interruptible", { timeout: 5000 }, async () => {
  const app = setup();
  app.ctx.cwd = "/home/student/practicals/practical11";
  app.compile("client.c", "client");
  assert.equal(await app.run("./client"), 1);
  assert.match(app.errors, /start the server first/);
  app.compile("server.c", "server");
  const pending = app.run("./server");
  await until(() => app.output.includes("Server is listening"));
  app.ctx.foregroundProcess.interrupt();
  assert.equal(await pending, 130);
  assert.equal(app.ctx.foregroundProcess, null);
});

test("socket stream preserves partial reads and returns EOF after peer closes", { timeout: 5000 }, async () => {
  const server = setup(), client = setup(server.fs);
  const prelude = '#include <sys/socket.h>\n#include <sys/un.h>\n#include <unistd.h>\n#include <string.h>\n#include <stdio.h>\n';
  server.source("stream-server", prelude + `int main() {
    struct sockaddr_un addr;
    addr.sun_family = AF_UNIX; strcpy(addr.sun_path, "/tmp/stream-test");
    int s = socket(AF_UNIX, SOCK_STREAM, 0);
    if (bind(s, (struct sockaddr *)&addr, sizeof(addr)) < 0) return 1;
    listen(s, 5); printf("ready");
    int c = accept(s, NULL, NULL);
    char b[10]; int n = read(c, b, 2); b[n] = 0; printf("%s|", b);
    n = read(c, b, 9); b[n] = 0; printf("%s|", b);
    printf("%d", read(c, b, 9));
    close(c); close(s); unlink("/tmp/stream-test"); return 0;
  }`);
  client.source("stream-client", prelude + `int main() {
    struct sockaddr_un addr;
    addr.sun_family = AF_UNIX; strcpy(addr.sun_path, "/tmp/stream-test");
    int s = socket(AF_UNIX, SOCK_STREAM, 0);
    if (connect(s, (struct sockaddr *)&addr, sizeof(addr)) < 0) return 1;
    write(s, "abcdef", 6); close(s); return 0;
  }`);
  const pending = server.run("./stream-server");
  await until(() => server.output.includes("ready"));
  assert.equal(await client.run("./stream-client"), 0);
  assert.equal(await pending, 0);
  assert.equal(server.output, "readyab|cdef|0");
  assert.equal(server.errors + client.errors, "");
});

test("practical 12 requires the ftok file, transfers child data, and removes its segment", async () => {
  const app = setup();
  app.ctx.cwd = "/home/student/practicals/practical12";
  app.compile("practical12.c", "practical12");
  assert.equal(await app.run("./practical12"), 1);
  assert.match(app.errors, /touch shmfile first/);
  app.fs.writeFile(app.ctx.cwd + "/shmfile", "");
  const errorsBefore = app.errors;
  for (let i = 0; i < 2; i++) assert.equal(await app.run("./practical12"), 0, app.errors);
  assert.equal(app.errors, errorsBefore);
  assert.equal(app.output, ("Child writing message to shared memory: Hello from child process!\n" +
    "Parent read message from shared memory: Hello from child process!\n").repeat(2));
  app.source("check-cleanup", '#include <sys/ipc.h>\n#include <sys/shm.h>\nint main() { return shmget(ftok("shmfile",65),1024,0) == -1 ? 0 : 1; }');
  assert.equal(await app.run("./check-cleanup"), 0);
});

test("shared memory aliases preserve writes, removal, and errors", async () => {
  const app = setup();
  app.source("memory", `#include <sys/shm.h>
#include <sys/ipc.h>
#include <string.h>
#include <stdio.h>
int main() {
  int id = shmget(123, 64, IPC_CREAT | 0600);
  if (id < 0 || shmget(123, 65, 0) != -1) return 1;
  if (shmget(123, 64, IPC_CREAT | IPC_EXCL) != -1) return 2;
  char *a = (char *)shmat(id, NULL, 0);
  char *b = (char *)shmat(id, NULL, 0);
  strncpy(a, "changed data", 64);
  if (strcmp(b, "changed data") != 0) return 3;
  b[0] = 'C';
  if (strcmp(a, "Changed data") != 0) return 4;
  shmctl(id, IPC_RMID, NULL);
  if (shmget(123, 64, 0) != -1) return 5;
  if (strcmp(a, "Changed data") != 0) return 6;
  if (shmdt(a) != 0 || shmdt(b) != 0 || shmdt(b) != -1) return 7;
  if (shmat(id, NULL, 0) != (char *)(-1)) return 8;
  return 0;
}`);
  assert.equal(await app.run("./memory"), 0, app.errors);
  assert.equal(app.errors, "");
});


test("existing FIFO and fork practicals still execute", async () => {
  const app = setup();
  app.fs.mkfifo("/tmp/myfifo");
  for (const name of ["writer", "reader"]) {
    app.compile(name + ".c", name);
    assert.equal(await app.run("./" + name), 0, app.errors);
  }
  app.compile("practicals/practical8/practical8_1.c", "fork-example");
  assert.equal(await app.run("./fork-example"), 0, app.errors);
  assert.match(app.output, /Reader: Received message: Hello from writer process!/);
  assert.match(app.output, /child\nparent\n/);
  assert.equal(app.errors, "");
});

test("file descriptor arguments are evaluated once", async () => {
  const app = setup();
  app.source("fd-evaluation", `#include <fcntl.h>
#include <unistd.h>
int main() {
  int fd = open("single-evaluation.txt", O_CREAT | O_WRONLY, 0600);
  int next = fd;
  if (write(next++, "ok", 2) != 2 || next != fd + 1) return 1;
  next = fd;
  close(next++);
  if (next != fd + 1) return 2;
  return 0;
}`);
  assert.equal(await app.run("./fd-evaluation"), 0, app.errors);
  assert.equal(app.fs.readFile("/home/student/single-evaluation.txt"), "ok");
});

