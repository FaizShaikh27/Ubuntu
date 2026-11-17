/**
 * GET /api/terminal-files
 *
 * Reads `public/terminal-files/` and mounts `public/exam/` as `~/exam`.
 * Returns the file tree as JSON. This is consumed by the VFS on the client to
 * inject teacher-provided files into every user's terminal automatically.
 *
 * Response shape:
 * {
 *   "type": "dir",
 *   "children": {
 *     "practicals": {
 *       "type": "dir",
 *       "children": {
 *         "practical8_1.c": { "type": "file", "content": "..." }
 *       }
 *     }
 *   }
 * }
 */

import fs from "fs";
import path from "path";

/** Recursively read a directory and return a VFS-compatible tree node. */
function readTree(absPath) {
  const stat = fs.statSync(absPath);

  if (stat.isDirectory()) {
    const children = {};
    let entries;
    try {
      entries = fs.readdirSync(absPath);
    } catch {
      return { type: "dir", children: {} };
    }
    for (const name of entries) {
      // Skip hidden files and the README (internal docs only)
      if (name.startsWith(".") || name === "README.txt") continue;
      try {
        const childTree = readTree(path.join(absPath, name));
        if (childTree) children[name] = childTree;
      } catch {
        // Skip unreadable entries silently
      }
    }
    return { type: "dir", children };
  }

  if (stat.isFile()) {
    // Only serve text files (skip binaries)
    try {
      const content = fs.readFileSync(absPath, "utf8");
      return { type: "file", content };
    } catch {
      return null; // binary or unreadable — skip
    }
  }

  return null; // symlinks etc — skip
}

export async function GET() {
  const publicDir = path.join(process.cwd(), "public", "terminal-files");
  const examDir = path.join(process.cwd(), "public", "exam");
  const tree = fs.existsSync(publicDir) ? readTree(publicDir) : { type: "dir", children: {} };
  if (fs.existsSync(examDir)) tree.children.exam = readTree(examDir);

  return Response.json(tree ?? { type: "dir", children: {} }, {
    headers: {
      "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
    },
  });
}
