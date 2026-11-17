#!/bin/bash
# Aim 7: Accept a number and calculate its factorial using a loop.
# Standalone Bash script; no package installation required.
read -r -p "Number (0-18): " n || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$n" =~ $integer_pattern ]] || [ "$n" -lt 0 ] || [ "$n" -gt 18 ]; then
    echo "Invalid input. Enter an integer from 0 to 18 without leading zeros."
    exit 1
fi
factorial=1
i=1
while [ "$i" -le "$n" ]; do
    factorial=$((factorial * i))
    i=$((i + 1))
done
echo "Factorial: $factorial"

