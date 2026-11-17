#!/bin/bash
# Aim 12: Accept two numbers and an operator (+, -, *, /) and perform the selected operation.
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
read -r -p "Operator (+, -, *, /): " operator || exit 1
case "$operator" in
    '+') echo "Result: $((a + b))" ;;
    '-') echo "Result: $((a - b))" ;;
    '*') echo "Result: $((a * b))" ;;
    '/')
        if [ "$b" -eq 0 ]; then
            echo "Division is undefined (division by zero)"
        else
            echo "Result (integer quotient): $((a / b))"
        fi
        ;;
    *) echo "Invalid operator. Use +, -, *, or /."; exit 1 ;;
esac

