#!/bin/bash
# Aim 19: Accept five numbers and calculate their total and average.
# Standalone Bash script; no package installation required.
total=0
for i in 1 2 3 4 5; do
    read -r -p "Number $i: " value || exit 1
    integer_pattern='^-?(0|[1-9][0-9]*)$'
    if ! [[ "$value" =~ $integer_pattern ]] || [ "$value" -lt -1000000 ] || [ "$value" -gt 1000000 ]; then
        echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
        exit 1
    fi
    total=$((total + value))
done
echo "Total: $total"
# Dividing an integer total by 5 gives an exact single decimal place.
sign=""
magnitude=$total
if [ "$total" -lt 0 ]; then
    sign="-"
    magnitude=$((0 - total))
fi
whole=$((magnitude / 5))
tenths=$((magnitude % 5 * 2))
printf 'Average: %s%s.%s\n' "$sign" "$whole" "$tenths"

