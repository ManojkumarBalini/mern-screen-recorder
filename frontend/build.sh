#!/usr/bin/env bash
# Exit on error
set -o errexit

# Modify this line as needed for your package manager (pnpm, yarn, npm)
npm install
npm run build
