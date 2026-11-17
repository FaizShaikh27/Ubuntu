#!/bin/bash
# Aim 4: Accept marks and display Pass for marks of 40 or above; otherwise display Fail.
# Standalone Bash script; no package installation required.
read -r -p "Marks (0-100): " marks || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$marks" =~ $integer_pattern ]] || [ "$marks" -lt 0 ] || [ "$marks" -gt 100 ]; then
    echo "Invalid input. Enter an integer from 0 to 100 without leading zeros."
    exit 1
fi
if [ "$marks" -ge 40 ]; then
    echo "Pass"
else
    echo "Fail"
fi

