#!/bin/bash
# Aim 20: Accept a number and display its digits in reverse order.
# Standalone Bash script; no package installation required.
read -r -p "Number: " n || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$n" =~ $integer_pattern ]] || [ "$n" -lt -1000000 ] || [ "$n" -gt 1000000 ]; then
    echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
    exit 1
fi
sign=""
if [ "$n" -lt 0 ]; then
    sign="-"
    n=$((0 - n))
fi
reversed=""
if [ "$n" -eq 0 ]; then
    reversed="0"
fi
while [ "$n" -gt 0 ]; do
    digit=$((n % 10))
    reversed="$reversed$digit"
    n=$((n / 10))
done
echo "Reversed: $sign$reversed"

