#!/bin/bash
# Aim 11: Accept a number and check whether it is divisible by both 5 and 11.
# Standalone Bash script; no package installation required.
read -r -p "Number: " n || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$n" =~ $integer_pattern ]] || [ "$n" -lt -1000000 ] || [ "$n" -gt 1000000 ]; then
    echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
    exit 1
fi
if [ "$((n % 5))" -eq 0 ] && [ "$((n % 11))" -eq 0 ]; then
    echo "Divisible by both 5 and 11"
else
    echo "Not divisible by both 5 and 11"
fi

