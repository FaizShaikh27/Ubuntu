# Ubuntu Terminal Online

Create me a website which works and UI exact replica of Terminal of Ubuntu. And it should be able to execute any command of ubuntu. I am doing this for students who dont have ubuntu and want to execute ubuntu practicals in windows. The terminal should be capable of all shell scripting commands and everything. And it should store files created if any in the cache only. And it should also have gcc compiler commands and everything.


## Shell scripting exam practicals

The 20 solutions from the shell scripting practicals PDF are in
`public/exam/<number>-<aim-short>/solution.sh`. The terminal file API loads
them into `~/exam` on both terminal pages, alongside the existing C practicals.
Reload the terminal page after starting the updated app, then run:

```sh
ls ~/exam
cat ~/exam/INSTRUCTIONS.txt
bash ~/exam/01-student-details/solution.sh
```

Each practical includes its aim, sample inputs, expected output, and run
instructions. All scripts use the cached shell's builtins and `wc`; no extra
packages are required. Numeric inputs are integers, division returns an
integer quotient, and the five-number average includes its fractional part.
Scripts validate their supported ranges; factorial accepts 0 through 18 to
keep results exact in the browser shell.

Run `npm test` to load the actual file API response into the virtual filesystem
and execute every solution using the same shell interpreter as the terminal.
The tests also cover edge cases, direct `./solution.sh` execution, and the
existing C practicals.

## Development setup

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
