#!/bin/bash
mkdir -p /tmp/git-test-hook
cd /tmp/git-test-hook
git init
echo "a" > a
git add a
mkdir .git/hooks
cat << 'HOOK' > .git/hooks/pre-commit
#!/bin/bash
echo "pre-commit hook: COMMIT_EDITMSG exists?"
ls .git/COMMIT_EDITMSG 2>/dev/null || echo "No"
HOOK
chmod +x .git/hooks/pre-commit
git commit -m "Test commit"
