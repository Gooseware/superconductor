#!/usr/bin/env bash

set -e

if command -v wt &> /dev/null; then
    echo "worktrunk (wt) is already installed."
    exit 0
fi

echo "worktrunk is not installed. Checking for cargo..."

if command -v cargo &> /dev/null; then
    echo "cargo found. Installing worktrunk..."
    cargo install worktrunk@0.68.0 --locked
    
    if ! command -v wt &> /dev/null; then
        echo "WARNING: 'wt' binary not found in PATH after installation."
        echo "Please ensure ~/.cargo/bin is in your PATH."
    fi
else
    echo "cargo is not installed."
    echo "Please install Rust and cargo (https://rustup.rs/) and then run: cargo install worktrunk"
    echo "Alternatively, download a precompiled binary from the worktrunk repository releases page."
    exit 1
fi
