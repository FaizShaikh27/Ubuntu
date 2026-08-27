"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleDot, Cpu, GitFork, HardDrive, MemoryStick, MessageSquareMore, Network, Pause, Play, RefreshCcw, Send, ShieldCheck, TimerReset, Workflow } from "lucide-react";

const NAV = [["/process", "01", "Program → Process"], ["/fork", "02", "fork()"], ["/zombie-orphan", "03", "Zombie & Orphan"], ["/coms", "04", "Communication"]];

function LessonShell({ lesson, kicker, title, subtitle, children }) {
  const activePath = lesson === "zombie" ? "/zombie-orphan" : `/${lesson}`;
  return <main className={`viz-page viz-${lesson}`}>
    <header className="viz-header">
      <Link href="/process" className="viz-logo"><span><Cpu size={17} /></span>OS VISUAL LAB</Link>
      <nav aria-label="Concept lessons">{NAV.map(([href, number, label]) => <Link href={href} className={href === activePath ? "is-active" : ""} key={href}><small>{number}</small>{label}</Link>)}</nav>
    </header>
    <section className="viz-title"><div><p>{kicker}</p><h1>{title}</h1></div><p>{subtitle}</p></section>
    {children}
    <footer className="viz-footer"><span>Move one step at a time. Watch the colored process.</span><span>Operating System · Concept Visualizer</span></footer>
  </main>;
}

function Controller({ steps, step, setStep, playing, setPlaying }) {
  useEffect(() => {
    if (!playing) return;
    if (step >= steps.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setStep((value) => value + 1), 1900);
    return () => window.clearTimeout(timer);
  }, [playing, setPlaying, setStep, step, steps.length]);
  const restartOrPlay = () => { if (playing) return setPlaying(false); if (step === steps.length - 1) setStep(0); setPlaying(true); };
  return <div className="viz-controller">
    <div className="viz-step-dots">{steps.map((item, index) => <button type="button" key={item.label} onClick={() => { setStep(index); setPlaying(false); }} className={index === step ? "is-active" : index < step ? "is-done" : ""} aria-label={`Step ${index + 1}: ${item.label}`}><span>{index < step ? <Check size={11} /> : index + 1}</span><small>{item.label}</small></button>)}</div>
    <div className="viz-buttons"><button className="viz-round" type="button" onClick={() => { setStep(0); setPlaying(false); }} aria-label="Reset"><RefreshCcw size={16} /></button><button className="viz-play" type="button" onClick={restartOrPlay}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause" : step === steps.length - 1 ? "Replay animation" : "Play animation"}</button><button className="viz-next" type="button" onClick={() => { setStep((value) => value === steps.length - 1 ? 0 : value + 1); setPlaying(false); }}>{step === steps.length - 1 ? "Again" : "Next"}<ChevronRight size={16} /></button></div>
  </div>;
}

function Caption({ step, steps }) {
  const current = steps[step];
  return <div className="viz-caption" key={`${step}-${current.title}`}><span>STEP {step + 1}</span><div><h2>{current.title}</h2><p>{current.text}</p></div><strong>{current.state}</strong></div>;
}

const PROCESS_STEPS = [
  { label: "Program", title: "A program is stored on disk", text: "It is only a file containing instructions. It has no PID and is not using memory or CPU.", state: "PASSIVE FILE" },
  { label: "New", title: "The OS creates a process", text: "The program enters from the right. The kernel gives it PID 42 and creates a Process Control Block.", state: "NEW" },
  { label: "Load", title: "The loader places it in memory", text: "Code and data enter the process address space. Stack and heap space are prepared.", state: "LOADING" },
  { label: "Ready", title: "It waits in the ready queue", text: "The process is fully prepared, but the CPU is busy. Its PCB waits in line.", state: "READY" },
  { label: "Run", title: "The scheduler sends it to the CPU", text: "The CPU restores PID 42's context and begins executing its instructions.", state: "RUNNING" },
  { label: "Wait", title: "An I/O request moves it aside", text: "The process enters a waiting queue. Another ready process can use the CPU meanwhile.", state: "WAITING" },
];

function MemoryTower({ loaded, active }) {
  return <div className={`memory-tower ${loaded ? "is-loaded" : ""} ${active ? "is-active" : ""}`}>
    <div className="memory-heading"><MemoryStick size={18} /><span><strong>MAIN MEMORY</strong><small>virtual address space</small></span></div>
    <div className="memory-block kernel-block"><ShieldCheck size={14} /><span><strong>Kernel</strong><small>protected OS memory</small></span></div>
    <div className="memory-block stack-block"><span><strong>{loaded ? "Stack" : "empty"}</strong><small>{loaded ? "function calls" : "—"}</small></span></div>
    <div className="memory-gap"><span>{loaded ? "free space" : "unmapped"}</span><i /></div>
    <div className="memory-block heap-block"><span><strong>{loaded ? "Heap" : "empty"}</strong><small>{loaded ? "dynamic data" : "—"}</small></span></div>
    <div className="memory-block data-block"><span><strong>{loaded ? "Data" : "empty"}</strong><small>{loaded ? "global variables" : "—"}</small></span></div>
    <div className="memory-block code-block"><span><strong>{loaded ? "Code" : "empty"}</strong><small>{loaded ? "instructions" : "—"}</small></span></div>
    <div className="address-labels"><span>HIGH</span><span>LOW</span></div>
  </div>;
}

function MiniQueue({ name, note, focus, children, className }) {
  return <div className={`mini-queue ${className} ${focus ? "is-focus" : ""}`}><div><strong>{name}</strong><small>{note}</small></div><div className="queue-slots">{children}</div></div>;
}

function ProcessLesson() {
  const [step, setStep] = useState(0); const [playing, setPlaying] = useState(false);
  const tokenClass = ["at-program", "at-entry", "at-memory", "at-ready", "at-cpu", "at-wait"][step];
  return <LessonShell lesson="process" kicker="01 · Watch the green process" title={<>From program<br />to running process</>} subtitle="Memory stays fixed on the left. Press Play and watch the program enter from the right, become a process, load into memory, join queues, and reach the CPU.">
    <section className="viz-card"><Controller steps={PROCESS_STEPS} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying} /><Caption step={step} steps={PROCESS_STEPS} />
      <div className="process-animation-stage">
        <div className="stage-label left-label"><span>OPERATING SYSTEM</span><small>fixed structures</small></div><div className="stage-label right-label"><span>USER PROGRAM</span><small>enters from here</small></div>
        <MemoryTower loaded={step >= 2} active={step === 2} />
        <div className={`scheduler-box ${step === 3 || step === 4 ? "is-active" : ""}`}><Workflow size={18} /><span><strong>Scheduler</strong><small>chooses next process</small></span></div>
        <div className={`cpu-box ${step === 4 ? "is-active" : ""}`}><Cpu size={27} /><span><small>CPU CORE</small><strong>{step === 4 ? "executing P42" : "available"}</strong></span><i /></div>
        <MiniQueue className="job-queue" name="Job queue" note="newly admitted" focus={step === 1}><span>P09</span>{step === 1 && <span className="focus-chip">P42</span>}<span>P68</span></MiniQueue>
        <MiniQueue className="ready-queue" name="Ready queue" note="waiting for CPU" focus={step === 3}><span>P17</span>{step === 3 && <span className="focus-chip">P42</span>}<span>P51</span></MiniQueue>
        <MiniQueue className="waiting-queue" name="Waiting queue" note="waiting for I/O" focus={step === 5}><span>P06</span>{step === 5 && <span className="focus-chip">P42</span>}</MiniQueue>
        <div className={`program-file ${step === 0 ? "is-active" : ""}`}><HardDrive size={24} /><span><small>ON DISK</small><strong>program.bin</strong><em>passive file</em></span></div>
        <div className={`loader-gate ${step === 2 ? "is-active" : ""}`}><ArrowLeft size={17} /><span>LOADER</span></div>
        <div className={`process-orb ${tokenClass}`}><span>P42</span><small>{PROCESS_STEPS[step].state}</small></div>
        <div className={`pcb-card ${step >= 1 ? "is-visible" : ""}`}><strong>PCB · PID 42</strong><span>state: {PROCESS_STEPS[step].state.toLowerCase()}</span></div>
        <div className="motion-hint"><ArrowLeft size={15} /><span>process moves right → left into the OS</span></div>
      </div>
      <div className="simple-legend"><span><i className="green-dot" />PID 42—the process to follow</span><span><i className="dark-dot" />Kernel-controlled structure</span><span><i className="gold-dot" />Current destination</span></div>
    </section>
  </LessonShell>;
}

const FORK_STEPS = [
  { label: "Parent", title: "Only the parent exists", text: "PID 100 is running. There is no child process yet.", state: "1 PROCESS" },
  { label: "fork()", title: "The parent asks the kernel to fork", text: "The parent moves into the fork system-call gate.", state: "SYSTEM CALL" },
  { label: "Clone", title: "The kernel creates the child", text: "A new PCB and PID 101 are created. Memory initially uses copy-on-write.", state: "CREATING" },
  { label: "Split", title: "Two processes leave the same fork()", text: "Parent receives 101; child receives 0. This tells each process which branch it is in.", state: "2 PROCESSES" },
  { label: "Ready", title: "Both can now be scheduled", text: "Parent and child are independent. The scheduler may run either one first.", state: "READY" },
];

function ForkLesson() {
  const [step, setStep] = useState(0); const [playing, setPlaying] = useState(false);
  return <LessonShell lesson="fork" kicker="02 · Watch one become two" title={<>How fork() creates<br />a child process</>} subtitle="Follow the parent into the kernel fork gate. A child emerges beside it with a new PID and a copy-on-write view of memory.">
    <section className="viz-card"><Controller steps={FORK_STEPS} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying} /><Caption step={step} steps={FORK_STEPS} />
      <div className={`fork-animation-stage step-${step}`}>
        <div className="fork-memory"><MemoryStick size={17} /><strong>Shared physical pages</strong><small>copy-on-write after fork</small><div><span>code</span><span>data</span><span>heap</span><span>stack</span></div></div>
        <div className={`parent-orb ${step >= 1 ? "at-gate" : ""} ${step >= 3 ? "after-fork" : ""}`}><span>P</span><strong>PID 100</strong><small>fork() → {step >= 3 ? "101" : "—"}</small></div>
        <div className={`fork-gate ${step >= 1 && step <= 2 ? "is-active" : ""}`}><ShieldCheck size={21} /><strong>KERNEL</strong><span>fork()</span><i /></div>
        <div className={`child-orb ${step >= 2 ? "is-born" : ""} ${step >= 3 ? "after-fork" : ""}`}><span>C</span><strong>PID 101</strong><small>fork() → {step >= 3 ? "0" : "—"}</small></div>
        <div className={`fork-line ${step >= 2 ? "is-visible" : ""}`}><GitFork size={23} /><span>parent of</span></div>
        <div className={`fork-ready ${step >= 4 ? "is-active" : ""}`}><strong>READY QUEUE</strong><div><span>PID 100</span><span>PID 101</span></div></div>
        <div className="fork-callout callout-pid"><small>Different identity</small><strong>PID 100 ≠ PID 101</strong></div><div className="fork-callout callout-memory"><small>Same starting content</small><strong>copied only when written</strong></div>
      </div>
    </section>
  </LessonShell>;
}

const FAMILY_SCENARIOS = {
  wait: { label: "Parent waits", steps: [
    { label: "Together", title: "Parent and child both exist", text: "The scheduler can run either process.", state: "BOTH READY", parent: "ready", child: "ready" },
    { label: "wait()", title: "Parent calls wait()", text: "The parent moves left into the child-wait queue. It gives up the CPU.", state: "PARENT WAITING", parent: "waiting", child: "running" },
    { label: "Child runs", title: "The child executes", text: "The child uses the CPU while the parent remains blocked.", state: "CHILD RUNNING", parent: "waiting", child: "running" },
    { label: "Exit", title: "The child finishes", text: "Its exit wakes the parent and makes the exit status available.", state: "CHILD EXITED", parent: "ready", child: "terminated" },
    { label: "Resume", title: "The parent resumes", text: "wait() returns; the child record is removed and the parent can continue.", state: "PARENT RUNNING", parent: "running", child: "reaped" },
  ]},
  zombie: { label: "Zombie", steps: [
    { label: "Together", title: "Parent and child both exist", text: "They start as normal living processes.", state: "BOTH ALIVE", parent: "running", child: "ready" },
    { label: "Child exits", title: "The child exits first", text: "Its execution is over, but the kernel keeps its PID and exit status.", state: "CHILD EXITED", parent: "sleeping", child: "zombie" },
    { label: "No wait()", title: "The parent does not collect the status", text: "The child remains as a tiny zombie entry in the process table—not a running process.", state: "ZOMBIE", parent: "sleeping", child: "zombie" },
    { label: "wait()", title: "The parent calls wait()", text: "The stored exit status moves from the child record to the parent.", state: "COLLECTING", parent: "running", child: "zombie" },
    { label: "Reaped", title: "The kernel removes the zombie", text: "No child process entry remains.", state: "CLEANED", parent: "running", child: "reaped" },
  ]},
  orphan: { label: "Orphan", steps: [
    { label: "Together", title: "Parent and child both exist", text: "The child initially points to PID 200 as its parent.", state: "PPID 200", parent: "running", child: "sleeping" },
    { label: "Parent exits", title: "The parent finishes first", text: "The child is still alive, so the relationship breaks.", state: "PARENT GONE", parent: "gone", child: "sleeping" },
    { label: "Orphan", title: "The living child becomes an orphan", text: "Orphan describes its relationship—not its execution state.", state: "ORPHAN", parent: "gone", child: "ready" },
    { label: "Adopt", title: "The system reaper adopts it", text: "The child moves under PID 1 so its future exit can be collected.", state: "PPID 1", parent: "reaper", child: "ready" },
    { label: "Continue", title: "The child continues normally", text: "It can run, wait, and exit just like any other process.", state: "CHILD RUNNING", parent: "reaper", child: "running" },
  ]},
};

function FamilyOrb({ role, state }) {
  const parent = role === "parent"; const reaper = state === "reaper";
  return <div className={`family-orb ${parent ? "family-parent" : "family-child"} state-${state}`}><span>{reaper ? "R" : parent ? "P" : "C"}</span><strong>{reaper ? "PID 1 · reaper" : parent ? "PID 200 · parent" : "PID 201 · child"}</strong><small>{state}</small></div>;
}

function ZombieLesson() {
  const [scenario, setScenario] = useState("wait"); const [step, setStep] = useState(0); const [playing, setPlaying] = useState(false); const data = FAMILY_SCENARIOS[scenario];
  const selectScenario = (key) => { setScenario(key); setStep(0); setPlaying(false); };
  return <LessonShell lesson="zombie" kicker="03 · Follow the parent and child" title={<>Waiting, zombie<br />and orphan</>} subtitle="Use the three scenarios. Watch the parent on the top path and the child on the bottom path move between CPU, wait queue, process table, and reaper.">
    <section className="viz-card"><div className="scenario-tabs">{Object.entries(FAMILY_SCENARIOS).map(([key, item]) => <button type="button" className={scenario === key ? "is-active" : ""} onClick={() => selectScenario(key)} key={key}><span>{key === "wait" ? "A" : key === "zombie" ? "B" : "C"}</span>{item.label}</button>)}</div>
      <Controller steps={data.steps} step={step} setStep={setStep} playing={playing} setPlaying={setPlaying} /><Caption step={step} steps={data.steps} />
      <div className={`family-animation-stage family-${scenario} family-step-${step}`}>
        <div className="family-cpu"><Cpu size={25} /><strong>CPU</strong><small>runs one process</small></div><div className="family-wait-queue"><TimerReset size={19} /><strong>CHILD-WAIT QUEUE</strong><small>parent blocks here after wait()</small></div><div className="family-table"><Workflow size={19} /><strong>PROCESS TABLE</strong><div><span>PID</span><span>STATE</span><span>EXIT STATUS</span></div></div><div className="family-reaper"><ShieldCheck size={19} /><strong>SYSTEM REAPER</strong><small>PID 1</small></div>
        <div className="parent-track"><span>PARENT PATH</span><i /></div><div className="child-track"><span>CHILD PATH</span><i /></div><FamilyOrb role="parent" state={data.steps[step].parent} /><FamilyOrb role="child" state={data.steps[step].child} />
        <div className={`status-slip ${scenario === "zombie" && step >= 1 && step < 4 ? "is-visible" : ""}`}><strong>exit = 0</strong><small>waiting to be collected</small></div><div className={`relation-line ${scenario === "orphan" && step >= 1 ? "is-broken" : ""}`}><span>{scenario === "orphan" && step >= 3 ? "new parent" : "parent of"}</span><i /></div>
      </div>
      <div className="definition-cards"><article><i className="wait-color" /><strong>Waiting</strong><span>alive, blocked for an event</span></article><article><i className="zombie-color" /><strong>Zombie</strong><span>terminated, status not collected</span></article><article><i className="orphan-color" /><strong>Orphan</strong><span>alive, original parent gone</span></article></div>
    </section>
  </LessonShell>;
}

const IPC = { fifo: { label: "Named pipe", icon: Network, object: "/tmp/myfifo", note: "kernel byte stream", packet: "HELLO" }, queue: { label: "Message queue", icon: MessageSquareMore, object: "QUEUE #17", note: "stored messages", packet: "MSG 01" }, memory: { label: "Shared memory", icon: MemoryStick, object: "SHARED BLOCK", note: "same mapped pages", packet: "DATA" }, signal: { label: "Signal", icon: CircleDot, object: "SIGNAL TABLE", note: "small notification", packet: "SIG" } };

function ComsLesson() {
  const [method, setMethod] = useState("fifo"); const [phase, setPhase] = useState(0); const item = IPC[method]; const Icon = item.icon;
  const steps = useMemo(() => [
    { label: "Separate", title: "The processes are isolated", text: "Process A cannot directly read Process B's private memory.", state: "NO BRIDGE" },
    { label: "Create IPC", title: `The OS creates a ${item.label.toLowerCase()}`, text: `Both processes can identify the same OS-managed object: ${item.object}.`, state: "BRIDGE READY" },
    { label: "Send", title: "Process A sends data", text: method === "memory" ? "A writes into pages also mapped by B." : "A crosses into the kernel and places data in the IPC object.", state: "SENDING" },
    { label: "Transfer", title: "The data travels through the bridge", text: method === "signal" ? "The kernel delivers a notification rather than a normal message." : "The colored packet moves from A toward B.", state: "IN TRANSIT" },
    { label: "Receive", title: "Process B receives it", text: "B observes the data or event and continues its own execution.", state: "RECEIVED" },
  ], [item.label, item.object, method]);
  const choose = (key) => { setMethod(key); setPhase(0); };
  return <LessonShell lesson="coms" kicker="04 · Watch the blue data packet" title={<>How two processes<br />communicate</>} subtitle="The processes stay separate on opposite sides. The operating system builds a bridge between them, then the data packet travels across it.">
    <section className="viz-card"><div className="ipc-tabs">{Object.entries(IPC).map(([key, value]) => { const TabIcon = value.icon; return <button type="button" className={method === key ? "is-active" : ""} onClick={() => choose(key)} key={key}><TabIcon size={17} /><span>{value.label}</span></button>; })}</div>
      <div className="manual-controller"><div className="viz-step-dots">{steps.map((value, index) => <button type="button" className={index === phase ? "is-active" : index < phase ? "is-done" : ""} onClick={() => setPhase(index)} key={value.label}><span>{index < phase ? <Check size={11} /> : index + 1}</span><small>{value.label}</small></button>)}</div><button type="button" onClick={() => setPhase((value) => value === steps.length - 1 ? 0 : value + 1)}>{phase === steps.length - 1 ? <RefreshCcw size={16} /> : <Send size={16} />}{phase === steps.length - 1 ? "Reset" : "Move data"}</button></div>
      <Caption step={phase} steps={steps} />
      <div className={`coms-animation-stage coms-step-${phase} coms-${method}`}><div className="coms-boundary"><span>KERNEL BOUNDARY</span></div><div className="coms-process process-a"><span>A</span><strong>PROCESS A</strong><small>PID 301 · private memory</small><div><i /><i /><i /></div></div><div className={`ipc-bridge ${phase >= 1 ? "is-visible" : ""}`}><Icon size={22} /><strong>{item.object}</strong><small>{item.note}</small><i /></div><div className="coms-process process-b"><span>B</span><strong>PROCESS B</strong><small>PID 702 · private memory</small><div><i /><i /><i /></div></div><div className={`data-packet ${phase >= 2 ? "is-visible" : ""}`}><span>{item.packet}</span><small>{method === "signal" ? "event" : "data"}</small></div><div className="coms-arrow"><ArrowRight size={20} /></div><div className={`received-badge ${phase >= 4 ? "is-visible" : ""}`}><Check size={14} />received</div></div>
      <div className="ipc-simple-facts"><span><strong>A and B stay isolated</strong>The IPC object is the bridge.</span><span><strong>The kernel controls access</strong>Permissions are checked.</span><span><strong>Only data crosses</strong>The whole process never moves.</span></div>
    </section>
  </LessonShell>;
}

export default function ProcessConcept({ lesson }) { if (lesson === "fork") return <ForkLesson />; if (lesson === "zombie") return <ZombieLesson />; if (lesson === "coms") return <ComsLesson />; return <ProcessLesson />; }
