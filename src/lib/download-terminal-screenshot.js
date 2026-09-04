import { toPng } from "html-to-image";

/** Render the visible terminal grid (one or two panes) and download it as PNG. */
export async function downloadTerminalScreenshot(element) {
  if (!element) throw new Error("Terminal area is not available");

  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    backgroundColor: window.getComputedStyle(document.body).backgroundColor || "#111827",
  });
  if (!dataUrl) throw new Error("The browser could not render the terminal image");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const link = document.createElement("a");
  link.download = `ubuntu-terminal-${timestamp}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
