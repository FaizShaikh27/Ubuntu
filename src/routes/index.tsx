import { createFileRoute } from "@tanstack/react-router";
import { UbuntuTerminal } from "@/components/UbuntuTerminal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ubuntu Terminal Online — Practise Linux & gcc in Windows" },
      {
        name: "description",
        content:
          "A working Ubuntu terminal in your browser: bash scripting, coreutils, gcc compilation and cached files. Built for students without a Linux machine.",
      },
      { property: "og:title", content: "Ubuntu Terminal Online — Practise Linux & gcc" },
      {
        property: "og:description",
        content: "Run bash scripts, coreutils and gcc programs in a browser-based Ubuntu terminal. No install needed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 font-sans">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Ubuntu Terminal for students
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            A GNOME Terminal replica that really runs your practicals: bash scripting, coreutils, file
            permissions and <code className="font-mono">gcc</code>. Files you create stay cached in this
            browser, so your work survives a reload.
          </p>
        </header>

        <UbuntuTerminal />

        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { title: "Shell scripting", body: "Variables, if/for/while, functions, pipes, redirection, globs, $(...) and arithmetic." },
            { title: "C practicals", body: "gcc hello.c -o hello then ./hello — printf, scanf, arrays, strings and math all execute." },
            { title: "Cached files", body: "nano, touch, mkdir and > redirects write into a virtual filesystem stored in your browser." },
          ].map((card) => (
            <article key={card.title} className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-card-foreground">{card.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
            </article>
          ))}
        </section>

        <p className="mt-6 text-xs text-muted-foreground">
          Need <code className="font-mono">apt</code>, <code className="font-mono">python3</code> or the real
          compiler toolchain? Run <code className="font-mono">ubuntu-vm</code> or press “Boot full Ubuntu”.
        </p>
      </div>
    </main>
  );
}
