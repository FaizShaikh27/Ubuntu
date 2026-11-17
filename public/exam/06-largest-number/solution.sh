#!/bin/bash
# Aim 6: Accept three numbers and display the largest.
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
read -r -p "Third number: " c || exit 1
integer_pattern='^-?(0|[1-9][0-9]*)$'
if ! [[ "$c" =~ $integer_pattern ]] || [ "$c" -lt -1000000 ] || [ "$c" -gt 1000000 ]; then
    echo "Invalid input. Enter an integer from -1000000 to 1000000 without leading zeros."
    exit 1
fi
largest=$a
if [ "$b" -gt "$largest" ]; then
    largest=$b
fi
if [ "$c" -gt "$largest" ]; then
    largest=$c
fi
echo "Largest: $largest"

