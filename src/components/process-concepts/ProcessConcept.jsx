"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Blocks,
  Box,
  Braces,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Cpu,
  Database,
  GitFork,
  HardDrive,
  Layers3,
  MemoryStick,
  MessageSquareMore,
  Network,
  Pause,
  Play,
  RefreshCcw,
  Send,
  ShieldCheck,
  Workflow,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/process", number: "01", label: "Program → process" },
  { href: "/fork", number: "02", label: "Creating a child" },
  { href: "/zombie-orphan", number: "03", label: "Wait, zombie & orphan" },
  { href: "/coms", number: "04", label: "Process communication" },
];

function Shell({ lesson, eyebrow, title, description, children }) {
  return (
    <main className={`pc-page pc-page-${lesson}`}>
      <header className="pc-topbar">
        <div className="pc-brand"><span className="pc-brand-mark"><Cpu size={17} /></span><strong>PROCESS / LAB</strong></div>
        <nav aria-label="Process lesson routes">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className={item.href.includes(lesson === "zombie" ? "zombie-orphan" : lesson) ? "is-active" : ""}>
              <span>{item.number}</span>{item.label}
            </Link>
          ))}
        </nav>
      </header>

      <section className="pc-intro">
        <div>
          <p className="pc-kicker">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        <p>{description}</p>
      </section>

      {children}

      <footer className="pc-footer">
        <span>Operating System · visual concept lab</span>
        <span>Use the controls to move one kernel decision at a time.</span>
      </footer>
    </main>
  );
}

function StepControls({ steps, step, setStep, playing, setPlaying, showPlay = true }) {
  useEffect(() => {
    if (!playing) return;
    if (step === steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setStep((value) => value + 1), 1650);
    return () => window.clearTimeout(timer);
  }, [playing, setPlaying, setStep, step, steps.length]);

  return (
    <div className="pc-controls">
      <div className="pc-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((item, index) => (
          <button
            type="button"
            key={item.title}
            className={index === step ? "is-current" : index < step ? "is-done" : ""}
            onClick={() => { setStep(index); setPlaying(false); }}
            aria-label={`Go to ${item.title}`}
          ><span>{index < step ? <Check size={11} /> : index + 1}</span><small>{item.short}</small></button>
        ))}
      </div>
      <div className="pc-control-buttons">
        <button type="button" className="pc-reset" onClick={() => { setStep(0); setPlaying(false); }} aria-label="Reset"><RefreshCcw size={16} /></button>
        {showPlay && (
          <button
            type="button"
            className="pc-primary-button"
            onClick={() => {
              if (playing) return setPlaying(false);
              if (step === steps.length - 1) setStep(0);
              setPlaying(true);
            }}
          >{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause" : step === steps.length - 1 ? "Replay" : "Play concept"}</button>
        )}
        <button
          type="button"
          className="pc-next"
          onClick={() => { setStep((value) => value === steps.length - 1 ? 0 : value + 1); setPlaying(false); }}
        >{step === steps.length - 1 ? "Start again" : "Next"}<ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

const PROCESS_STEPS = [
  { short: "Stored", title: "The program is stored", body: "An executable is passive data on secondary storage. It is not yet a process and has no PID." },
  { short: "Admitted", title: "The OS admits a job", body: "The long-term scheduler admits the program from the job pool and the kernel creates its process control block." },
  { short: "Loaded", title: "The loader builds memory", body: "The loader maps code and data, prepares the heap and stack, and links the process to physical memory through page tables." },
  { short: "Ready", title: "The process joins the ready queue", body: "The process has everything except a CPU. It waits with other ready processes for the short-term scheduler." },
  { short: "Running", title: "The dispatcher gives it a CPU", body: "Registers and the program counter are restored from the PCB. Instructions now execute in user mode." },
  { short: "Waiting", title: "I/O moves it to a wait queue", body: "When the process requests disk or another event, the kernel blocks it. The CPU immediately runs another ready process." },
];

function MemoryMap({ active }) {
  const sections = [
    { name: "Stack", note: "calls · local variables", at: 2 },
    { name: "Free virtual space", note: "stack ↓     ↑ heap", at: 2, free: true },
    { name: "Heap", note: "dynamic allocation", at: 2 },
    { name: "Data", note: "globals · static data", at: 2 },
    { name: "Text / code", note: "machine instructions", at: 2 },
  ];
  return (
    <div className={`pc-memory-map ${active >= 2 ? "is-loaded" : ""}`}>
      <div className="pc-address"><span>high address</span><span>low address</span></div>
      <div className="pc-memory-sections">
        <div className="pc-kernel-space"><ShieldCheck size={15} /><strong>Kernel space</strong><small>protected · OS only</small></div>
        {sections.map((section) => (
          <div key={section.name} className={section.free ? "is-free" : ""}>
            <strong>{active >= section.at ? section.name : "unmapped"}</strong>
            <small>{active >= section.at ? section.note : "—"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Queue({ title, type, items, active }) {
  return (
    <div className={`pc-queue ${active ? "is-active" : ""}`}>
      <div><strong>{title}</strong><small>{type}</small></div>
      <div className="pc-queue-items">
        {items.map((item) => <span key={item} className={item === "P42" ? "is-focus" : ""}>{item}</span>)}
      </div>
    </div>
  );
}

function ProcessLesson() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = PROCESS_STEPS[step];
  const location = step === 0 ? "disk" : step === 1 ? "job" : step === 2 ? "memory" : step === 3 ? "ready" : step === 4 ? "cpu" : "wait";

  return (
    <Shell
      lesson="process"
      eyebrow="01 · From disk to CPU"
      title={<>How a program<br />becomes a process.</>}
      description="Follow one executable as the operating system admits it, constructs its memory, places it in scheduling queues, and dispatches it to the CPU."
    >
      <section className="pc-workbench">
        <StepControls steps={PROCESS_STEPS} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying} />
        <div className="pc-explainer">
          <span>0{step + 1}</span><div><p>{current.short}</p><h2>{current.title}</h2><p>{current.body}</p></div>
        </div>

        <div className="pc-process-stage">
          <div className="pc-storage-column">
            <div className={`pc-device-card ${location === "disk" ? "is-active" : ""}`}>
              <HardDrive size={22} /><div><small>SECONDARY STORAGE</small><strong>program.bin</strong><span>code + static data</span></div>
            </div>
            <div className="pc-loader-arrow"><span>exec()</span><i /></div>
            <div className={`pc-pcb ${step >= 1 ? "is-visible" : ""}`}>
              <div><CircleDot size={15} /><strong>PCB · P42</strong></div>
              <dl><span><dt>PID</dt><dd>42</dd></span><span><dt>state</dt><dd>{step < 3 ? "new" : step === 3 ? "ready" : step === 4 ? "running" : "waiting"}</dd></span><span><dt>PC</dt><dd>0x4010</dd></span></dl>
            </div>
          </div>

          <div className="pc-ram-column">
            <div className="pc-column-title"><MemoryStick size={17} /><span><strong>Main memory</strong><small>virtual address space for P42</small></span></div>
            <MemoryMap active={step} />
          </div>

          <div className="pc-os-column">
            <div className="pc-column-title"><Workflow size={17} /><span><strong>Kernel scheduling</strong><small>queues hold PCBs, not whole processes</small></span></div>
            <Queue title="Job queue" type="all submitted jobs" items={step <= 1 ? ["P18", "P42", "P71"] : ["P18", "P71"]} active={location === "job"} />
            <Queue title="Ready queue" type="waiting for CPU" items={step === 3 ? ["P07", "P42", "P63"] : step > 3 ? ["P07", "P63"] : ["P07", "P63"]} active={location === "ready"} />
            <div className={`pc-cpu-card ${location === "cpu" ? "is-active" : ""}`}><Cpu size={25} /><span><small>CPU CORE 0</small><strong>{location === "cpu" ? "P42 running" : "dispatcher"}</strong></span></div>
            <Queue title="Device wait queue" type="waiting for I/O" items={step === 5 ? ["P11", "P42"] : ["P11"]} active={location === "wait"} />
          </div>

          <div className={`pc-token pc-token-${location}`}><span>P42</span></div>
        </div>

        <div className="pc-concept-strip">
          <article><Layers3 size={18} /><div><strong>Virtual memory</strong><p>The process sees one continuous address space; page tables map it to RAM frames.</p></div></article>
          <article><Box size={18} /><div><strong>Kernel space</strong><p>Privileged OS code manages memory, queues, devices, and process state.</p></div></article>
          <article><Clock3 size={18} /><div><strong>Context switch</strong><p>The kernel saves one PCB and restores another when the CPU changes processes.</p></div></article>
        </div>
      </section>
    </Shell>
  );
}

const FORK_STEPS = [
  { short: "Parent", title: "One parent is running", body: "PID 320 is executing normally with its own PCB and virtual address space." },
  { short: "System call", title: "The parent calls fork()", body: "Execution enters the kernel. The parent is temporarily inside the fork system call." },
  { short: "Duplicate", title: "The kernel creates a child PCB", body: "A new PID, scheduling record, and parent relationship are created for PID 321." },
  { short: "Memory", title: "Memory is shared copy-on-write", body: "Parent and child initially map the same physical pages as read-only. A write creates a private copy." },
  { short: "Return", title: "Both processes resume", body: "The child receives 0 from fork(); the parent receives the child PID. Both continue after the same call." },
  { short: "Schedule", title: "The scheduler chooses who runs", body: "Both processes are independent. Either may run first unless synchronization such as wait() is used." },
];

function AddressSpace({ role, pid, step, child = false }) {
  const visible = !child || step >= 2;
  return (
    <div className={`pc-address-space ${child ? "is-child" : "is-parent"} ${visible ? "is-visible" : ""} ${step >= 4 ? "is-ready" : ""}`}>
      <header><span>{role}</span><strong>PID {pid}</strong><small>fork() → {step < 4 ? "…" : child ? "0" : "321"}</small></header>
      <div className="pc-space-body">
        <span>stack <i>{child && step >= 3 ? "COW" : ""}</i></span>
        <span>heap <i>{child && step >= 3 ? "COW" : ""}</i></span>
        <span>data <i>{child && step >= 3 ? "COW" : ""}</i></span>
        <span>code <i>{step >= 3 ? "shared" : ""}</i></span>
      </div>
      <footer><CircleDot size={12} /> {step >= 4 ? "ready" : child ? "being created" : step === 1 ? "in kernel" : "running"}</footer>
    </div>
  );
}

function ForkLesson() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const current = FORK_STEPS[step];
  return (
    <Shell lesson="fork" eyebrow="02 · fork() system call" title={<>One process in.<br />Two processes out.</>} description="See what the kernel creates, what is initially shared, and why the parent and child take different branches after the same system call.">
      <section className="pc-workbench">
        <StepControls steps={FORK_STEPS} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying} />
        <div className="pc-explainer"><span>0{step + 1}</span><div><p>{current.short}</p><h2>{current.title}</h2><p>{current.body}</p></div></div>
        <div className="pc-fork-stage">
          <div className={`pc-fork-kernel ${step >= 1 && step <= 3 ? "is-active" : ""}`}>
            <ShieldCheck size={19} /><div><small>KERNEL</small><strong>{step < 1 ? "system call boundary" : step === 1 ? "fork() received" : step === 2 ? "allocate PID + PCB" : "map pages copy-on-write"}</strong></div>
          </div>
          <div className="pc-fork-diagram">
            <AddressSpace role="PARENT" pid="320" step={step} />
            <div className={`pc-fork-branch ${step >= 2 ? "is-visible" : ""}`}><GitFork size={28} /><span>created by kernel</span></div>
            <AddressSpace role="CHILD" pid="321" step={step} child />
          </div>
          <div className="pc-fork-facts">
            <article className={step >= 2 ? "is-lit" : ""}><strong>New identity</strong><span>PID 321 · PPID 320</span></article>
            <article className={step >= 3 ? "is-lit" : ""}><strong>Same starting snapshot</strong><span>code, data, heap, stack</span></article>
            <article className={step >= 4 ? "is-lit" : ""}><strong>Different return value</strong><span>parent: 321 · child: 0</span></article>
            <article className={step >= 5 ? "is-lit" : ""}><strong>Independent scheduling</strong><span>either process can run next</span></article>
          </div>
        </div>
      </section>
    </Shell>
  );
}

const WAIT_SCENARIOS = {
  wait: {
    label: "Parent waits",
    steps: [
      { short: "Fork", title: "Parent creates a child", body: "Both processes become independently schedulable.", parent: "running", child: "ready", link: "related" },
      { short: "wait()", title: "Parent calls wait()", body: "The parent blocks itself because the child has not terminated yet.", parent: "waiting", child: "running", link: "waiting" },
      { short: "Child runs", title: "The child completes its work", body: "The child uses the CPU while the parent remains in the child-wait queue.", parent: "waiting", child: "running", link: "waiting" },
      { short: "Exit", title: "Child exits and wakes the parent", body: "Exit status becomes available; the kernel moves the parent back to Ready.", parent: "ready", child: "terminated", link: "signal" },
      { short: "Reap", title: "wait() returns to the parent", body: "The parent collects the exit status and the child PCB can be removed.", parent: "running", child: "reaped", link: "complete" },
    ],
  },
  zombie: {
    label: "Zombie window",
    steps: [
      { short: "Fork", title: "Parent creates a child", body: "The two processes start with a normal parent-child relationship.", parent: "running", child: "ready", link: "related" },
      { short: "Exit", title: "The child exits first", body: "The kernel preserves its PID and exit status so the parent can collect them.", parent: "sleeping", child: "zombie", link: "zombie" },
      { short: "No wait", title: "Parent has not called wait()", body: "The child is terminated—not executing—but its small process-table record remains.", parent: "sleeping", child: "zombie", link: "zombie" },
      { short: "wait()", title: "Parent finally calls wait()", body: "The stored status is returned to the parent.", parent: "running", child: "zombie", link: "signal" },
      { short: "Reaped", title: "The zombie disappears", body: "The kernel removes the child entry from the process table.", parent: "running", child: "reaped", link: "complete" },
    ],
  },
  orphan: {
    label: "Orphan child",
    steps: [
      { short: "Fork", title: "Parent creates a child", body: "The child initially has PPID 510.", parent: "running", child: "ready", link: "related" },
      { short: "Parent exits", title: "The parent terminates first", body: "The child is still alive, so its original parent can no longer wait for it.", parent: "terminated", child: "sleeping", link: "broken" },
      { short: "Orphan", title: "The living child is now an orphan", body: "Orphan is a relationship, not a scheduling state: this child happens to be sleeping.", parent: "gone", child: "sleeping", link: "broken" },
      { short: "Adopt", title: "A system reaper adopts the child", body: "The kernel reparents it to init or another subreaper so someone can collect its status later.", parent: "reaper", child: "ready", link: "adopted" },
      { short: "Continue", title: "The child continues normally", body: "It can run and terminate like any other process; its PPID now identifies the reaper.", parent: "waiting", child: "running", link: "adopted" },
    ],
  },
};

function ProcessNode({ type, state, scenario }) {
  const parent = type === "parent";
  const gone = state === "gone" || state === "reaped";
  const label = state === "reaper" ? "SYSTEM REAPER" : parent ? "PARENT" : "CHILD";
  const pid = state === "reaper" ? "PID 1" : parent ? "PID 510" : "PID 511";
  return (
    <div className={`pc-process-node is-${state} ${gone ? "is-gone" : ""}`}>
      <div className="pc-node-head"><span>{label}</span><strong>{pid}</strong></div>
      <div className="pc-node-core"><Cpu size={28} /><strong>{state}</strong><small>{!parent && scenario === "orphan" && state !== "reaped" ? (state === "ready" || state === "running" ? "PPID 1" : "PPID 510") : parent && state === "waiting" ? "wait(511)" : "process state"}</small></div>
      <div className="pc-node-pcb"><span>PCB</span><i /><i /><i /></div>
    </div>
  );
}

function ZombieLesson() {
  const [scenario, setScenario] = useState("wait");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const data = WAIT_SCENARIOS[scenario];
  const current = data.steps[step];
  function choose(value) { setScenario(value); setStep(0); setPlaying(false); }
  return (
    <Shell lesson="zombie" eyebrow="03 · Process relationships" title={<>Who waits for whom?</>} description="Compare correct wait() coordination with the two important edge cases: a terminated child that has not been reaped, and a living child whose parent has terminated.">
      <section className="pc-workbench">
        <div className="pc-scenario-switch" role="tablist" aria-label="Waiting scenarios">
          {Object.entries(WAIT_SCENARIOS).map(([key, item]) => <button type="button" role="tab" aria-selected={scenario === key} className={scenario === key ? "is-active" : ""} onClick={() => choose(key)} key={key}><span>{key === "wait" ? "A" : key === "zombie" ? "B" : "C"}</span>{item.label}</button>)}
        </div>
        <StepControls steps={data.steps} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying} />
        <div className="pc-explainer"><span>0{step + 1}</span><div><p>{current.short}</p><h2>{current.title}</h2><p>{current.body}</p></div></div>
        <div className={`pc-wait-stage is-${current.link}`}>
          <ProcessNode type="parent" state={current.parent} scenario={scenario} />
          <div className="pc-relation">
            <span>{current.link === "waiting" ? "parent waits for child" : current.link === "zombie" ? "exit status not collected" : current.link === "adopted" ? "new parent relationship" : current.link === "broken" ? "original relationship ends" : current.link === "signal" ? "SIGCHLD / wake up" : current.link === "complete" ? "status collected" : "parent of"}</span>
            <i /><ArrowRight size={18} />
          </div>
          <ProcessNode type="child" state={current.child} scenario={scenario} />
        </div>
        <div className="pc-definition-row">
          <article><strong>Waiting</strong><p>A live process is blocked until an event occurs. It is not using the CPU.</p></article>
          <article><strong>Zombie</strong><p>A child has terminated, but its parent has not collected the exit status.</p></article>
          <article><strong>Orphan</strong><p>A child is still alive after its original parent terminates, so it is reparented.</p></article>
        </div>
      </section>
    </Shell>
  );
}

const IPC_METHODS = {
  fifo: { label: "Named pipe", icon: Network, object: "/tmp/myfifo", detail: "Kernel byte buffer", direction: "one-way stream", shared: false },
  queue: { label: "Message queue", icon: MessageSquareMore, object: "queue #17", detail: "Kernel message records", direction: "discrete messages", shared: false },
  memory: { label: "Shared memory", icon: MemoryStick, object: "shared segment", detail: "Mapped physical pages", direction: "both read & write", shared: true },
  signal: { label: "Signal", icon: CircleDot, object: "SIGUSR1", detail: "Kernel notification", direction: "event only", shared: false },
};

function ComsLesson() {
  const [method, setMethod] = useState("fifo");
  const [phase, setPhase] = useState(0);
  const [message, setMessage] = useState("page ready");
  const data = IPC_METHODS[method];
  const MethodIcon = data.icon;
  const steps = useMemo(() => [
    { short: "Create", title: `Create the ${data.label.toLowerCase()}`, body: `The OS prepares ${data.object} as the communication object both processes can reference.` },
    { short: "Connect", title: "Both processes attach", body: "Process A and Process B obtain access through system calls; the kernel checks permissions." },
    { short: "Send", title: data.shared ? "Process A updates shared bytes" : "Process A sends data", body: data.shared ? "The write changes memory pages mapped into both address spaces." : `The kernel accepts the ${method === "signal" ? "notification" : "payload"} from Process A.` },
    { short: "Transfer", title: data.shared ? "The shared mapping is visible" : "The OS transfers it", body: data.shared ? "Synchronization is still needed to prevent both processes changing the data at once." : "The IPC object preserves the data or event until Process B receives it." },
    { short: "Receive", title: "Process B observes the communication", body: method === "signal" ? "A signal handler or default action responds to the event; signals do not carry a normal message body." : "Process B reads the bytes and can continue its work." },
  ], [data, method]);
  const current = steps[phase];
  function choose(key) { setMethod(key); setPhase(0); }
  return (
    <Shell lesson="coms" eyebrow="04 · Inter-process communication" title={<>Separate memory.<br />A deliberate bridge.</>} description="Processes are isolated by default. IPC gives them an OS-managed way to exchange bytes, messages, shared data, or notifications.">
      <section className="pc-workbench">
        <div className="pc-ipc-tabs" role="tablist" aria-label="IPC method">
          {Object.entries(IPC_METHODS).map(([key, item]) => { const Icon = item.icon; return <button type="button" role="tab" aria-selected={method === key} className={method === key ? "is-active" : ""} onClick={() => choose(key)} key={key}><Icon size={17} /><span><strong>{item.label}</strong><small>{item.direction}</small></span></button>; })}
        </div>
        <StepControls steps={steps} step={phase} setStep={setPhase} playing={false} setPlaying={() => {}} showPlay={false} />
        <div className="pc-explainer"><span>0{phase + 1}</span><div><p>{current.short}</p><h2>{current.title}</h2><p>{current.body}</p></div></div>
        <div className="pc-ipc-stage">
          <div className={`pc-ipc-process pc-process-a ${phase >= 1 ? "is-connected" : ""}`}>
            <div><span>PROCESS A</span><strong>PID 701</strong></div><Cpu size={30} /><small>private address space</small>
          </div>
          <div className="pc-ipc-middle">
            <div className={`pc-ipc-object ${phase >= 0 ? "is-created" : ""}`}><MethodIcon size={23} /><strong>{data.object}</strong><small>{data.detail}</small></div>
            <div className={`pc-data-line ${phase >= 2 ? "is-moving" : ""} ${phase >= 4 ? "is-delivered" : ""}`}>
              <i /><span>{method === "signal" ? "event" : message || "data"}</span><ArrowRight size={17} />
            </div>
          </div>
          <div className={`pc-ipc-process pc-process-b ${phase >= 1 ? "is-connected" : ""} ${phase >= 4 ? "has-data" : ""}`}>
            <div><span>PROCESS B</span><strong>PID 884</strong></div><Cpu size={30} /><small>{phase >= 4 ? (method === "signal" ? "event handled" : `received: ${message || "data"}`) : "private address space"}</small>
          </div>
        </div>
        {method !== "signal" && <div className="pc-payload"><label htmlFor="ipc-payload">Data carried by the simulation</label><input id="ipc-payload" value={message} maxLength={24} onChange={(event) => { setMessage(event.target.value); if (phase === 4) setPhase(2); }} /><span>{message.length} bytes</span></div>}
        <div className="pc-ipc-actions">
          <div><strong>{data.label}</strong><span>{data.shared ? "fast for large data · requires synchronization" : `${data.direction} · mediated by the kernel`}</span></div>
          <button type="button" onClick={() => setPhase((value) => value === steps.length - 1 ? 0 : value + 1)}>{phase === steps.length - 1 ? <RefreshCcw size={16} /> : <Send size={16} />}{phase === steps.length - 1 ? "Reset bridge" : "Advance communication"}</button>
        </div>
      </section>
    </Shell>
  );
}

export default function ProcessConcept({ lesson }) {
  if (lesson === "fork") return <ForkLesson />;
  if (lesson === "zombie") return <ZombieLesson />;
  if (lesson === "coms") return <ComsLesson />;
  return <ProcessLesson />;
}
