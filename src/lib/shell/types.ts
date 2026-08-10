import type { VFS } from "./fs";

export interface ShellHost {
  /** Print raw text to the terminal (already-final output). */
  write(text: string): void;
  /** Read a single line of input typed by the user. */
  readLine(): Promise<string | null>;
  /** Clear the visible screen. */
  clear(): void;
  /** Ask the UI to boot the real Ubuntu VM. */
  bootRealUbuntu(): void;
  /** Close the session. */
  exit(): void;
}

export interface ShellCtx {
  fs: VFS;
  cwd: string;
  vars: Record<string, string>;
  exported: Set<string>;
  aliases: Record<string, string>;
  funcs: Record<string, unknown>;
  history: string[];
  status: number;
  exiting: boolean;
  host: ShellHost;
}

export interface CmdIO {
  args: string[];
  stdin: string;
  out(text: string): void;
  err(text: string): void;
  readLine(): Promise<string | null>;
}

export type CommandFn = (io: CmdIO, ctx: ShellCtx) => Promise<number> | number;
