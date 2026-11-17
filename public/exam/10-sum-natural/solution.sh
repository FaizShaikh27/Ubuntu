#!/bin/bash
# Aim 10: Accept a number and sum all numbers from 1 up to that number using a loop.
# Standalone Bash script; no package installation required.
read -r -p "Upper limit (0-10000): " n || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$n" =~ $integer_pattern ]] || [ "$n" -lt 0 ] || [ "$n" -gt 10000 ]; then
    echo "Invalid input. Enter an integer from 0 to 10000 without leading zeros."
    exit 1
fi
total=0
i=1
while [ "$i" -le "$n" ]; do
    total=$((total + i))
    i=$((i + 1))
done
echo "Sum: $total"

