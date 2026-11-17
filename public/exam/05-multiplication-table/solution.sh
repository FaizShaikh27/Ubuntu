#!/bin/bash
# Aim 5: Accept a number and display its multiplication table from 1 to 10.
# Standalone Bash script; no package installation required.
read -r -p "Number: " n || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$n" =~ $integer_pattern ]] || [ "$n" -lt -1000000 ] || [ "$n" -gt 1000000 ]; then
    echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
    exit 1
fi
for i in 1 2 3 4 5 6 7 8 9 10; do
    echo "$n x $i = $((n * i))"
done

