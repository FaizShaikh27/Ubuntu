#!/bin/bash
# Aim 16: Accept a character and check whether it is a vowel or consonant.
# Standalone Bash script; no package installation required.
read -r -p "Enter one English letter: " character || exit 1
case "$character" in
    [aeiouAEIOU]) echo "Vowel" ;;
    [a-zA-Z]) echo "Consonant" ;;
    *) echo "Invalid input. Enter exactly one English letter."; exit 1 ;;
esac

