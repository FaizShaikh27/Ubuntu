#!/bin/bash
# Aim 14: Accept a number and calculate the sum of its digits.
# Standalone Bash script; no package installation required.
read -r -p "Number: " n || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$n" =~ $integer_pattern ]] || [ "$n" -lt -1000000 ] || [ "$n" -gt 1000000 ]; then
    echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
    exit 1
fi
if [ "$n" -lt 0 ]; then
    n=$((0 - n))
fi
total=0
while [ "$n" -gt 0 ]; do
    digit=$((n % 10))
    total=$((total + digit))
    n=$((n / 10))
done
echo "Sum of digits: $total"

