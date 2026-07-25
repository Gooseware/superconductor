#!/bin/bash
cd /tmp/git-test-hook
git commit --allow-empty -m "Test commit
Swarm-Authorized: true" --no-verify
cat .git/COMMIT_EDITMSG
echo "---"
git commit --allow-empty -m "Another commit"
