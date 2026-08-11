== HOW TO ADD FILES TO THE TERMINAL ==

Any file or directory you place inside this `terminal-files/` folder
will automatically appear in the terminal for ALL users, inside
their home directory: /home/student/

Changes are picked up on every page load — no rebuild required.

FOLDER STRUCTURE
----------------
Files placed directly here  →  /home/student/<filename>
Files inside a subfolder    →  /home/student/<subfolder>/<filename>

Example:
  public/
    terminal-files/
      practicals/
        practical8/
          practical8_1.c   →  appears as  /home/student/practicals/practical8/practical8_1.c

NOTES
-----
- If a user has already edited a file with the same name, their version
  is preserved and the public version is NOT overwritten.
- Only NEW files (not present in the user's browser storage) are injected.
- Supported file encodings: UTF-8 text files only.
- Binary files are not supported in the virtual filesystem.
