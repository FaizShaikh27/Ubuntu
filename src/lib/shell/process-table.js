/**
 * ProcessTable — simulated Linux process table for educational OS practicals.
 *
 * Tracks PIDs, PPIDs, states (R/S/Z) and provides the correct zombie/orphan
 * semantics required by Practical 8 (fork, wait, sleep, exit).
 *
 * This is a module-level singleton so both the C interpreter (minic.js) and
 * the shell commands (commands.js) can share the same view of running processes.
 */

export class ProcessTable {
  constructor() {
    this.nextPid = 1001;
    /** @type {Map<number, ProcessEntry>} */
    this.procs = new Map();
    // PID 1 = init — always alive, adopts orphans
    this.procs.set(1, {
      pid: 1,
      ppid: 0,
      state: "S",
      name: "init",
      cmd: "init",
      exitStatus: null,
      children: [],
    });
  }

  /** Reset for a fresh run (called before each program execution). */
  reset() {
    this.nextPid = 1001;
    this.procs.clear();
    this.procs.set(1, {
      pid: 1,
      ppid: 0,
      state: "S",
      name: "init",
      cmd: "init",
      exitStatus: null,
      children: [],
    });
  }

  /**
   * Allocate a new process entry and return its PID.
   * @param {number} ppid  Parent PID
   * @param {string} name  Executable name (for ps output)
   * @returns {number} New PID
   */
  alloc(ppid, name = "a.out") {
    const pid = this.nextPid++;
    this.procs.set(pid, {
      pid,
      ppid,
      state: "R",
      name,
      cmd: name,
      exitStatus: null,
      children: [],
    });
    const parent = this.procs.get(ppid);
    if (parent) parent.children.push(pid);
    return pid;
  }

  /** Mark a process as Running. */
  markRunning(pid) {
    const p = this.procs.get(pid);
    if (p) p.state = "R";
  }

  /** Mark a process as Sleeping. */
  markSleeping(pid) {
    const p = this.procs.get(pid);
    if (p) p.state = "S";
  }

  /**
   * Exit a process.
   * - If parent is alive and hasn't called wait() yet → becomes Zombie (Z).
   * - If parent is dead → just remove (init would have reaped it).
   * Also reparents any children of this process to PID 1.
   * @param {number} pid
   * @param {number} status  Exit status code
   */
  markZombie(pid, status) {
    const p = this.procs.get(pid);
    if (!p) return;
    p.exitStatus = status;
    // Reparent any children of this process to init (PID 1)
    this.reparentOrphans(pid);
    const parent = this.procs.get(p.ppid);
    if (parent && parent.state !== "Z") {
      // Parent is alive — become zombie, wait for parent to reap
      p.state = "Z";
    } else {
      // Parent is dead (or doesn't exist) — just remove
      this.procs.delete(pid);
    }
  }

  /**
   * Reparent all children of a dying process to PID 1 (init).
   * This is the orphan mechanism.
   * @param {number} deadPid
   */
  reparentOrphans(deadPid) {
    const init = this.procs.get(1);
    if (!init) return;
    for (const [, p] of this.procs) {
      if (p.ppid === deadPid && p.pid !== deadPid) {
        p.ppid = 1;
        if (!init.children.includes(p.pid)) {
          init.children.push(p.pid);
        }
      }
    }
    // Clean up the dead process's children list
    const dead = this.procs.get(deadPid);
    if (dead) dead.children = [];
  }

  /**
   * Parent calls wait() — reap ONE zombie child of ppid.
   * @param {number} ppid  The calling (parent) PID
   * @returns {number}  Reaped child PID, or -1 if none
   */
  reap(ppid) {
    const parent = this.procs.get(ppid);
    if (!parent) return -1;
    for (const childPid of parent.children) {
      const child = this.procs.get(childPid);
      if (child && child.state === "Z") {
        this.procs.delete(childPid);
        parent.children = parent.children.filter((c) => c !== childPid);
        return childPid;
      }
    }
    return -1;
  }

  /**
   * Remove a process entirely (e.g. after parent exits and child is already zombie).
   * @param {number} pid
   */
  remove(pid) {
    const p = this.procs.get(pid);
    if (!p) return;
    // Remove from parent's children list
    const parent = this.procs.get(p.ppid);
    if (parent) parent.children = parent.children.filter((c) => c !== pid);
    this.procs.delete(pid);
  }

  /**
   * Return a sorted snapshot of the process table for ps output.
   * @returns {ProcessEntry[]}
   */
  snapshot() {
    return [...this.procs.values()].sort((a, b) => a.pid - b.pid);
  }
}

/**
 * Module-level singleton shared between minic.js, exec.js, and commands.js.
 * Reset this before each program execution to avoid stale entries.
 */
export const globalProcessTable = new ProcessTable();
