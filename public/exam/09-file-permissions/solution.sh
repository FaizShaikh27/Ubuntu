#!/bin/bash
# Aim 9: Accept a filename, check whether it exists, and display its read, write, and execute permissions.
# Standalone Bash script; no package installation required.
read -r -p "Filename: " filename || exit 1
if [ ! -f "$filename" ]; then
    echo "File does not exist: $filename"
else
    echo "File exists: $filename"
    if [ -r "$filename" ]; then
        echo "Read: yes"
    else
        echo "Read: no"
    fi
    if [ -w "$filename" ]; then
        echo "Write: yes"
    else
        echo "Write: no"
    fi
    if [ -x "$filename" ]; then
        echo "Execute: yes"
    else
        echo "Execute: no"
    fi
fi

