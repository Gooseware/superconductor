import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
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
    const timestamp = Date.now();
    const signKey = crypto
      .createHash('sha256')
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
      env: { ...process.env, SUPERCONDUCTOR_FLAGS: '--no-signoff' },
      encoding: 'utf8',
    });

    expect(output).toContain('BYPASS: --no-signoff');
    expect(fs.existsSync(yoloLogPath)).toBe(true);
    const logContent = fs.readFileSync(yoloLogPath, 'utf8');
    expect(logContent).toContain(`YOLO BYPASS: --no-signoff flag present for track ${testTrackId}`);
  });
});
