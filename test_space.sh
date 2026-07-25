#!/bin/bash
STAGED_FILES="packages/core/src/file with space.ts
other_file.txt"
for file in $STAGED_FILES; do
    echo "File: $file"
    if [[ "$file" == packages/*/src/* ]]; then
        echo "Match!"
    fi
done
