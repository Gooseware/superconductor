import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';

describe('Git Pre-Commit SignOff Verification Hook', () => {
  const testTrackId = 'test-hook-track';
  const testSessionId = 'test-hook-session';
  const repoRoot = path.resolve(__dirname, '../../../../');
  const signoffFilePath = path.join(repoRoot, `superconductor/quorum/signoff_${testTrackId}.json`);
  const verifyScriptPath = path.join(repoRoot, 'scripts/hooks/verify-signoff.mjs');
  const yoloLogPath = path.join(repoRoot, 'superconductor/logs/yolo-audit.log');

  beforeEach(() => {
    if (fs.existsSync(signoffFilePath)) fs.rmSync(signoffFilePath, { force: true });
    if (fs.existsSync(yoloLogPath)) fs.rmSync(yoloLogPath, { force: true });
  });

  afterEach(() => {
    if (fs.existsSync(signoffFilePath)) fs.rmSync(signoffFilePath, { force: true });
    if (fs.existsSync(yoloLogPath)) fs.rmSync(yoloLogPath, { force: true });
  });

  it('exits 0 when a valid sign-off token exists', () => {
    process.env.SIGN_OFF_SECRET = 'test-secret';
    const timestamp = Date.now();
    const secret = process.env.SIGN_OFF_SECRET;
    if (!secret) throw new Error('SIGN_OFF_SECRET environment variable is not set');
    const signKey = crypto
      .createHmac('sha256', secret)
      .update(`${testSessionId}:${testTrackId}:${timestamp}`)
      .digest('hex');

    fs.mkdirSync(path.dirname(signoffFilePath), { recursive: true });
    fs.writeFileSync(
      signoffFilePath,
      JSON.stringify({
        approved_by: 'user',
        timestamp,
        oracle_conv_id: 'conv-1',
        sign_key: signKey,
        session_id: testSessionId,
        track_id: testTrackId,
      })
    );

    const output = execSync(`node "${verifyScriptPath}" "${testTrackId}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, SIGN_OFF_SECRET: 'test-secret' },
    });
    expect(output).toContain('Approved by user at');
  });

  it('exits 1 when no sign-off token exists', () => {
    expect(() => {
      execSync(`node "${verifyScriptPath}" "${testTrackId}" 2>&1`, {
        cwd: repoRoot,
        encoding: 'utf8',
      });
    }).toThrow();
  });

  it('exits 0 and logs to yolo-audit.log when --no-signoff flag is set', () => {
    const output = execSync(`node "${verifyScriptPath}" "${testTrackId}"`, {
      cwd: repoRoot,
      env: { ...process.env, SUPERCONDUCTOR_FLAGS: '--no-signoff', NODE_ENV: 'test', SIGN_OFF_SECRET: 'test-secret' },
      encoding: 'utf8',
    });

    expect(output).toContain('BYPASS: --no-signoff');
    expect(fs.existsSync(yoloLogPath)).toBe(true);
    const logContent = fs.readFileSync(yoloLogPath, 'utf8');
    expect(logContent).toContain(`YOLO BYPASS: --no-signoff flag present for track ${testTrackId}`);
  });
});

describe('commit-msg hook resolution', () => {
  let tempRepo: string;
  const repoRoot = path.resolve(__dirname, '../../../../');
  const commitMsgHook = path.join(repoRoot, 'scripts/hooks/commit-msg');

  beforeEach(() => {
    tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-msg-test-'));
    execSync('git init', { cwd: tempRepo, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tempRepo });
    execSync('git config user.email "test@example.com"', { cwd: tempRepo });
    execSync('git commit --allow-empty -m "initial"', { cwd: tempRepo, stdio: 'ignore' });
    execSync('git checkout -b track/test-hook-track', { cwd: tempRepo, stdio: 'ignore' });
  });

  afterEach(() => {
    if (fs.existsSync(tempRepo)) {
      fs.rmSync(tempRepo, { recursive: true, force: true });
    }
  });

  it('exits 0 without error when verify-signoff.mjs is not found anywhere', () => {
    const msgFile = path.join(tempRepo, 'COMMIT_MSG');
    fs.writeFileSync(msgFile, 'feat: test commit\n\nSwarm-Authorized: test-user\n');

    const hookCopy = path.join(tempRepo, 'commit-msg');
    fs.copyFileSync(commitMsgHook, hookCopy);
    fs.chmodSync(hookCopy, 0o755);

    const output = execSync(`bash "${hookCopy}" "${msgFile}"`, {
      cwd: tempRepo,
      env: { ...process.env, SUPERCONDUCTOR_DIR: '', SUPERCONDUCTOR_FLAGS: '--no-signoff' },
      encoding: 'utf8',
    });

    expect(output).not.toContain('Sign-off verified');
  });

  it('resolves verify-signoff.mjs via SUPERCONDUCTOR_DIR', () => {
    const msgFile = path.join(tempRepo, 'COMMIT_MSG');
    fs.writeFileSync(msgFile, 'feat: test commit\n\nSwarm-Authorized: test-user\n');

    const hookCopy = path.join(tempRepo, 'commit-msg');
    fs.copyFileSync(commitMsgHook, hookCopy);
    fs.chmodSync(hookCopy, 0o755);

    const output = execSync(`bash "${hookCopy}" "${msgFile}"`, {
      cwd: tempRepo,
      env: {
        ...process.env,
        SUPERCONDUCTOR_DIR: repoRoot,
        SUPERCONDUCTOR_FLAGS: '--no-signoff',
      },
      encoding: 'utf8',
    });

    expect(output).toContain('Sign-off verified');
  });

  it('resolves verify-signoff.mjs relative to hook directory ($(dirname "$0")/verify-signoff.mjs)', () => {
    const msgFile = path.join(tempRepo, 'COMMIT_MSG');
    fs.writeFileSync(msgFile, 'feat: test commit\n\nSwarm-Authorized: test-user\n');

    const hookDir = path.join(tempRepo, 'custom-hooks');
    fs.mkdirSync(hookDir, { recursive: true });
    const hookCopy = path.join(hookDir, 'commit-msg');
    fs.copyFileSync(commitMsgHook, hookCopy);
    fs.chmodSync(hookCopy, 0o755);

    fs.writeFileSync(
      path.join(hookDir, 'verify-signoff.mjs'),
      'console.log("MOCK_FROM_DIRNAME"); process.exit(0);'
    );

    const output = execSync(`bash "${hookCopy}" "${msgFile}"`, {
      cwd: tempRepo,
      env: {
        ...process.env,
        SUPERCONDUCTOR_DIR: '',
        SUPERCONDUCTOR_FLAGS: '--no-signoff',
      },
      encoding: 'utf8',
    });

    expect(output).toContain('Sign-off verified: MOCK_FROM_DIRNAME');
  });

  it('does not resolve unvalidated ./scripts/hooks/verify-signoff.mjs CWD fallback', () => {
    const msgFile = path.join(tempRepo, 'COMMIT_MSG');
    fs.writeFileSync(msgFile, 'feat: test commit\n\nSwarm-Authorized: test-user\n');

    const dotGitHooks = path.join(tempRepo, '.git', 'hooks');
    fs.mkdirSync(dotGitHooks, { recursive: true });
    const hookCopy = path.join(dotGitHooks, 'commit-msg');
    fs.copyFileSync(commitMsgHook, hookCopy);
    fs.chmodSync(hookCopy, 0o755);

    const targetHooksDir = path.join(tempRepo, 'scripts', 'hooks');
    fs.mkdirSync(targetHooksDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetHooksDir, 'verify-signoff.mjs'),
      'console.log("MOCK_FROM_TARGET_REPO"); process.exit(0);'
    );

    const output = execSync(`bash "${hookCopy}" "${msgFile}"`, {
      cwd: tempRepo,
      env: {
        ...process.env,
        SUPERCONDUCTOR_DIR: '',
        SUPERCONDUCTOR_FLAGS: '--no-signoff',
      },
      encoding: 'utf8',
    });

    expect(output).not.toContain('Sign-off verified: MOCK_FROM_TARGET_REPO');
  });
});
