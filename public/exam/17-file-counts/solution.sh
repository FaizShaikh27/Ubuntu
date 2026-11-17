#!/bin/bash
# Aim 17: Accept a filename and display its number of lines, words, and characters.
# Standalone Bash script; no package installation required.
read -r -p "Filename: " filename || exit 1
if [ ! -f "$filename" ]; then
    echo "File does not exist: $filename"
    exit 1
fi
if [ ! -r "$filename" ]; then
    echo "File is not readable: $filename"
    exit 1
fi
echo "Lines: $(wc -l < "$filename")"
echo "Words: $(wc -w < "$filename")"
echo "Characters: $(wc -m < "$filename")"

