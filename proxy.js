import { NextResponse, userAgent } from "next/server";

/**
 * Send Linux desktop browsers to the custom-CSS version of the terminal.
 * Browser user-agent strings normally identify Ubuntu as "Linux", so Linux
 * is the most reliable server-side signal available here.
 */
export function proxy(request) {
  const { isBot, os } = userAgent(request);
  const osName = os.name?.toLowerCase() ?? "";

  if (!isBot && (osName === "linux" || osName.includes("ubuntu"))) {
    return NextResponse.redirect(new URL("/u", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
