#!/bin/bash
# Aim 8: Accept a number and check whether it is positive, negative, or zero.
# Standalone Bash script; no package installation required.
read -r -p "Number: " n || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$n" =~ $integer_pattern ]] || [ "$n" -lt -1000000 ] || [ "$n" -gt 1000000 ]; then
    echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
    exit 1
fi
if [ "$n" -gt 0 ]; then
    echo "Positive"
elif [ "$n" -lt 0 ]; then
    echo "Negative"
else
    echo "Zero"
fi

