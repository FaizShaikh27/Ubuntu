import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/terminal-files/route.js";
import { VFS } from "../src/lib/shell/fs.js";
import { createSession } from "../src/lib/shell/session.js";
import { runCommandLine } from "../src/lib/shell/interpreter.js";

const response = await GET();
const publicFiles = await response.json();
const examTree = publicFiles.children.exam;
const samples = [
  {
    "slug": "01-student-details",
    "inputs": [
      "Asha Patil",
      "001234",
      "A"
    ],
    "expected": "Name: Asha Patil\nPRN: 001234\nDivision: A"
  },
  {
    "slug": "02-arithmetic",
    "inputs": [
      "12",
      "5"
    ],
    "expected": "Sum: 17\nDifference: 7\nMultiplication: 60\nDivision (integer quotient): 2"
  },
  {
    "slug": "03-even-odd",
    "inputs": [
      "7"
    ],
    "expected": "Odd"
  },
  {
    "slug": "04-pass-fail",
    "inputs": [
      "40"
    ],
    "expected": "Pass"
  },
  {
    "slug": "05-multiplication-table",
    "inputs": [
      "7"
    ],
    "expected": "7 x 1 = 7\n7 x 2 = 14\n7 x 3 = 21\n7 x 4 = 28\n7 x 5 = 35\n7 x 6 = 42\n7 x 7 = 49\n7 x 8 = 56\n7 x 9 = 63\n7 x 10 = 70"
  },
  {
    "slug": "06-largest-number",
    "inputs": [
      "4",
      "9",
      "2"
    ],
    "expected": "Largest: 9"
  },
  {
    "slug": "07-factorial",
    "inputs": [
      "5"
    ],
    "expected": "Factorial: 120"
  },
  {
    "slug": "08-number-sign",
    "inputs": [
      "-7"
    ],
    "expected": "Negative"
  },
  {
    "slug": "09-file-permissions",
    "inputs": [
      "exam/09-file-permissions/solution.sh"
    ],
    "expected": "File exists: exam/09-file-permissions/solution.sh\nRead: yes\nWrite: yes\nExecute: yes"
  },
  {
    "slug": "10-sum-natural",
    "inputs": [
      "10"
    ],
    "expected": "Sum: 55"
  },
  {
    "slug": "11-divisible-5-11",
    "inputs": [
      "55"
    ],
    "expected": "Divisible by both 5 and 11"
  },
  {
    "slug": "12-calculator",
    "inputs": [
      "12",
      "5",
      "*"
    ],
    "expected": "Result: 60"
  },
  {
    "slug": "13-even-numbers",
    "inputs": [
      "10"
    ],
    "expected": "Even numbers:\n2\n4\n6\n8\n10"
  },
  {
    "slug": "14-digit-sum",
    "inputs": [
      "12345"
    ],
    "expected": "Sum of digits: 15"
  },
  {
    "slug": "15-leap-year",
    "inputs": [
      "2024"
    ],
    "expected": "Leap year"
  },
  {
    "slug": "16-vowel-consonant",
    "inputs": [
      "A"
    ],
    "expected": "Vowel"
  },
  {
    "slug": "17-file-counts",
    "inputs": [
      "exam/17-file-counts/sample.txt"
    ],
    "expected": "Lines: 2\nWords: 5\nCharacters: 27"
  },
  {
    "slug": "18-directory-exists",
    "inputs": [
      "exam"
    ],
    "expected": "Directory exists: exam"
  },
  {
    "slug": "19-total-average",
    "inputs": [
      "1",
      "2",
      "3",
      "4",
      "6"
    ],
    "expected": "Total: 16\nAverage: 3.2"
  },
  {
    "slug": "20-reverse-number",
    "inputs": [
      "120"
    ],
    "expected": "Reversed: 021"
  }
];

function terminal() {
  const fs = new VFS();
  fs.mergePublic(publicFiles);
  const input = [];
  let exits = 0;
  const ctx = createSession({
    readLine: async () => {
      assert.ok(input.length, "Script requested unexpected input");
      return input.shift();
    },
    exit: () => { exits++; },
  }, fs);
  return {
    fs, ctx, get exits() { return exits; },
    async command(command, values = []) {
      input.push(...values);
      let output = "", errors = "";
      const status = await runCommandLine(command, ctx, {
        out: s => { output += s; }, err: s => { errors += s; },
      });
      assert.equal(input.length, 0, "Script did not consume all supplied inputs");
      assert.equal(errors, "", errors);
      return { status, output };
    },
    run(slug, values) { return this.command("bash ~/exam/" + slug + "/solution.sh", values); },
  };
}

test("file API exposes all exam solutions alongside the existing C practicals", () => {
  assert.equal(response.status, 200);
  assert.equal(Object.keys(examTree.children).filter(name => /^\d\d-/.test(name)).length, 20);
  assert.ok(publicFiles.children.practicals.children.practical11.children["server.c"]);
  for (const sample of samples) {
    assert.ok(examTree.children[sample.slug].children["solution.sh"]);
    assert.ok(examTree.children[sample.slug].children["INSTRUCTIONS.txt"]);
  }
});

for (const sample of samples) {
  test("aim " + sample.slug + ": executes in the virtual terminal", async () => {
    const app = terminal();
    const result = await app.run(sample.slug, sample.inputs);
    assert.equal(result.status, 0);
    assert.ok(result.output.endsWith(sample.expected + "\n"), result.output);
    assert.equal(app.exits, 0);
    const node = app.fs.lookup("/home/student/exam/" + sample.slug + "/solution.sh");
    assert.equal(node.mode, 0o755);
  });
}

test("all solutions execute directly from their directory", async () => {
  const app = terminal();
  for (const sample of samples) {
    assert.equal((await app.command("cd ~/exam/" + sample.slug)).status, 0);
    // Samples that name files use paths relative to the home directory.
    const values = sample.inputs.map(value => value.startsWith("exam") ? "/home/student/" + value : value);
    const result = await app.command("./solution.sh", values);
    assert.equal(result.status, 0, sample.slug + ": " + result.output);
  }
});

test("arithmetic, zero division, every calculator operator and invalid operator", async () => {
  const app = terminal();
  assert.match((await app.run("02-arithmetic", ["-12", "5"])).output, /Sum: -7\nDifference: -17\nMultiplication: -60\nDivision \(integer quotient\): -2/);
  assert.match((await app.run("02-arithmetic", ["8", "0"])).output, /undefined \(division by zero\)/);
  for (const [op, expected] of [["+", "17"], ["-", "7"], ["*", "60"], ["/", "(integer quotient): 2"]]) {
    const result = await app.run("12-calculator", ["12", "5", op]);
    assert.equal(result.status, 0);
    assert.ok(result.output.endsWith((op === "/" ? "Result " : "Result: ") + expected + "\n"), result.output);
  }
  assert.match((await app.run("12-calculator", ["1", "0", "/"])).output, /division by zero/);
  assert.equal((await app.run("12-calculator", ["1", "2", "?"])).status, 1);
  assert.equal(app.exits, 0);
  assert.equal((await app.command("echo still-running")).output, "still-running\n");
});

test("boundaries, signs, ties and loop results", async () => {
  const app = terminal();
  for (const [slug, inputs, expected] of [
    ["03-even-odd", ["-4"], "Even"], ["03-even-odd", ["0"], "Even"],
    ["04-pass-fail", ["39"], "Fail"], ["04-pass-fail", ["100"], "Pass"],
    ["06-largest-number", ["-9", "-2", "-2"], "Largest: -2"],
    ["06-largest-number", ["9", "2", "1"], "Largest: 9"],
    ["06-largest-number", ["1", "2", "9"], "Largest: 9"],
    ["07-factorial", ["0"], "Factorial: 1"],
    ["07-factorial", ["18"], "Factorial: 6402373705728000"],
    ["08-number-sign", ["0"], "Zero"], ["08-number-sign", ["3"], "Positive"],
    ["10-sum-natural", ["0"], "Sum: 0"], ["10-sum-natural", ["10000"], "Sum: 50005000"],
    ["11-divisible-5-11", ["5"], "Not divisible by both 5 and 11"],
    ["11-divisible-5-11", ["11"], "Not divisible by both 5 and 11"],
    ["11-divisible-5-11", ["0"], "Divisible by both 5 and 11"],
    ["13-even-numbers", ["1"], "Even numbers:"],
    ["13-even-numbers", ["5"], "Even numbers:\n2\n4"],
    ["14-digit-sum", ["-909"], "Sum of digits: 18"],
    ["14-digit-sum", ["0"], "Sum of digits: 0"],
    ["15-leap-year", ["1900"], "Not a leap year"], ["15-leap-year", ["2000"], "Leap year"],
    ["15-leap-year", ["2023"], "Not a leap year"],
    ["16-vowel-consonant", ["z"], "Consonant"], ["16-vowel-consonant", ["u"], "Vowel"],
    ["19-total-average", ["-1", "-2", "-3", "-4", "-6"], "Total: -16\nAverage: -3.2"],
    ["19-total-average", ["-1", "0", "0", "0", "0"], "Total: -1\nAverage: -0.2"],
    ["20-reverse-number", ["-120"], "Reversed: -021"], ["20-reverse-number", ["0"], "Reversed: 0"],
  ]) {
    const result = await app.run(slug, inputs);
    assert.equal(result.status, 0, slug);
    assert.ok(result.output.endsWith(expected + "\n"), result.output);
  }
});

test("file existence, spaces in paths, actual permission bits and directory type", async () => {
  const app = terminal();
  app.fs.writeFile("/home/student/file with spaces.txt", "some data", 0o000);
  let result = await app.run("09-file-permissions", ["file with spaces.txt"]);
  assert.ok(result.output.endsWith("Read: no\nWrite: no\nExecute: no\n"), result.output);
  await app.command("chmod 500 'file with spaces.txt'");
  result = await app.run("09-file-permissions", ["file with spaces.txt"]);
  assert.ok(result.output.endsWith("Read: yes\nWrite: no\nExecute: yes\n"), result.output);
  assert.match((await app.run("09-file-permissions", ["missing"])).output, /File does not exist/);
  assert.match((await app.run("09-file-permissions", ["exam"])).output, /File does not exist/);
  assert.match((await app.run("18-directory-exists", ["missing"])).output, /Directory does not exist/);
  assert.match((await app.run("18-directory-exists", ["file with spaces.txt"])).output, /Directory does not exist/);
});

test("wc counts newlines and Unicode characters; missing/unreadable input is handled", async () => {
  const app = terminal();
  for (const [content, expected] of [
    ["", "Lines: 0\nWords: 0\nCharacters: 0"],
    ["one two", "Lines: 0\nWords: 2\nCharacters: 7"],
    ["é 😀\n", "Lines: 1\nWords: 2\nCharacters: 4"],
  ]) {
    app.fs.writeFile("/home/student/count me.txt", content);
    const result = await app.run("17-file-counts", ["count me.txt"]);
    assert.equal(result.status, 0);
    assert.ok(result.output.endsWith(expected + "\n"), result.output);
  }
  assert.equal((await app.command("wc -c < 'count me.txt'")).output, "8\n");
  assert.equal((await app.run("17-file-counts", ["missing"])).status, 1);
  app.fs.chmod("/home/student/count me.txt", 0o000);
  assert.equal((await app.run("17-file-counts", ["count me.txt"])).status, 1);
  assert.equal((await app.command("echo still-running")).output, "still-running\n");
  assert.equal(app.exits, 0);
});

test("invalid inputs fail without closing or poisoning the terminal", async () => {
  const app = terminal();
  for (const [slug, input] of [
    ["03-even-odd", "abc"], ["03-even-odd", "08"], ["03-even-odd", "1.5"],
    ["03-even-odd", "1000001"], ["04-pass-fail", "-1"], ["04-pass-fail", "101"],
    ["07-factorial", "-1"], ["07-factorial", "19"], ["10-sum-natural", "-1"],
    ["15-leap-year", "0"], ["16-vowel-consonant", "ab"], ["16-vowel-consonant", "7"],
  ]) {
    const result = await app.run(slug, [input]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /Invalid input/);
    assert.equal(app.ctx.exiting, false);
    assert.equal(app.exits, 0);
  }
  assert.equal((await app.command("echo still-running")).output, "still-running\n");
});

