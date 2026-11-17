#!/bin/bash
# Aim 15: Accept a year and check whether it is a leap year.
# Standalone Bash script; no package installation required.
read -r -p "Year: " year || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$year" =~ $integer_pattern ]] || [ "$year" -lt 1 ] || [ "$year" -gt 9999 ]; then
    echo "Invalid input. Enter an integer from 1 to 9999 without leading zeros."
    exit 1
fi
if [ "$((year % 400))" -eq 0 ]; then
    echo "Leap year"
elif [ "$((year % 100))" -eq 0 ]; then
    echo "Not a leap year"
elif [ "$((year % 4))" -eq 0 ]; then
    echo "Leap year"
else
    echo "Not a leap year"
fi

