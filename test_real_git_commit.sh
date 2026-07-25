#!/bin/bash
mkdir -p /tmp/git-test-hook2
cd /tmp/git-test-hook2
git init
echo "a" > a
git add a
mkdir -p .git/hooks
cat << 'HOOK' > .git/hooks/pre-commit
#!/bin/bash
COMMIT_MSG_FILE="$(git rev-parse --git-dir)/COMMIT_EDITMSG"
if [ -f "\$COMMIT_MSG_FILE" ] && grep -q "Swarm-Authorized: true" "\$COMMIT_MSG_FILE"; then
    exit 0
fi
echo "Blocked!"
exit 1
HOOK
chmod +x .git/hooks/pre-commit
git commit -m "Test commit
Swarm-Authorized: true" || echo "Commit failed as expected"
