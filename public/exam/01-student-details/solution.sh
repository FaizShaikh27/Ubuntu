#!/bin/bash
# Aim 1: Accept a student's Name, PRN, and Division and display the student details.
# Standalone Bash script; no package installation required.
read -r -p "Name: " name || exit 1
read -r -p "PRN: " prn || exit 1
read -r -p "Division: " division || exit 1
printf 'Name: %s\nPRN: %s\nDivision: %s\n' "$name" "$prn" "$division"

