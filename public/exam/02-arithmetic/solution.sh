#!/bin/bash
# Aim 2: Accept two numbers and display their sum, difference, multiplication, and division.
# Standalone Bash script; no package installation required.
read -r -p "First number: " a || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$a" =~ $integer_pattern ]] || [ "$a" -lt -1000000 ] || [ "$a" -gt 1000000 ]; then
    echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
    exit 1
fi
read -r -p "Second number: " b || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$b" =~ $integer_pattern ]] || [ "$b" -lt -1000000 ] || [ "$b" -gt 1000000 ]; then
    echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
    exit 1
fi
echo "Sum: $((a + b))"
echo "Difference: $((a - b))"
echo "Multiplication: $((a * b))"
if [ "$b" -eq 0 ]; then
    echo "Division: undefined (division by zero)"
else
    echo "Division (integer quotient): $((a / b))"
fi

