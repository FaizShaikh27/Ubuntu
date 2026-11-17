#!/bin/bash
# Aim 18: Accept a directory name and check whether it exists.
# Standalone Bash script; no package installation required.
read -r -p "Directory: " directory || exit 1
if [ -d "$directory" ]; then
    echo "Directory exists: $directory"
else
    echo "Directory does not exist: $directory"
fi

