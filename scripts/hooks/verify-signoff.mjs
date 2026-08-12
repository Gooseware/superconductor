import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const rawTrackId = process.argv[2];

if (!rawTrackId) {
  console.error('Missing trackId argument');
  process.exit(1);
}

const trackId = path.basename(rawTrackId);

// Check --no-signoff in SUPERCONDUCTOR_FLAGS env var
const flags = process.env.SUPERCONDUCTOR_FLAGS || '';
if (flags.includes('--no-signoff')) {
  if (!process.stdout.isTTY) {
    console.error('BYPASS: --no-signoff is only allowed in interactive TTY prompts');
    process.exit(1);
  }
  try {
    const logDir = path.resolve('superconductor/logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logMsg = `[${new Date().toISOString()}] YOLO BYPASS: --no-signoff flag present for track ${trackId}\n`;
    fs.appendFileSync(path.join(logDir, 'yolo-audit.log'), logMsg);
  } catch (e) {
    // Ignore logging errors
  }
  console.log(`BYPASS: --no-signoff flag present for track ${trackId}`);
  process.exit(0);
}

function generateSignKey(sessionId, trackId, oracleTs) {
  const secret = process.env.SIGN_OFF_SECRET || 'dev-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(`${sessionId}:${trackId}:${oracleTs}`)
    .digest('hex');
}

// 1. Try reading signoff file: superconductor/quorum/signoff_${trackId}.json
const fileSignoffPath = path.resolve(`superconductor/quorum/signoff_${trackId}.json`);
let signOffRecord = null;

if (fs.existsSync(fileSignoffPath)) {
  try {
    signOffRecord = JSON.parse(fs.readFileSync(fileSignoffPath, 'utf8'));
  } catch (e) {
    signOffRecord = null;
  }
}

// 2. Try loading from LibSQL quorum_state.db if available
if (!signOffRecord) {
  const homeDir = process.env.HOME || os.homedir();
  const dbPaths = [
    path.join(process.cwd(), 'superconductor', 'quorum', 'quorum_state.db'),
    path.join(homeDir, '.superconductor', 'quorum-state.db'),
  ];
  for (const dbPath of dbPaths) {
    if (fs.existsSync(dbPath)) {
      try {
        const { createClient } = await import('@libsql/client');
        const client = createClient({ url: `file:${dbPath}` });
        const res = await client.execute({
          sql: `SELECT * FROM quorum_state WHERE track_id = ?`,
          args: [trackId],
        });
        if (res.rows.length > 0) {
          const row = res.rows[0];
          if (row.sign_off_record) {
            signOffRecord = JSON.parse(String(row.sign_off_record));
          } else if (row.metadata) {
            const meta = JSON.parse(String(row.metadata));
            signOffRecord = meta.sign_off_record || null;
          }
          if (signOffRecord && !signOffRecord.session_id && !signOffRecord.sessionId && row.session_id) {
            signOffRecord.session_id = String(row.session_id);
          }
        }
      } catch (e) {
        // Ignore DB load errors
      }
    }
  }
}

if (!signOffRecord || !signOffRecord.sign_key || !signOffRecord.timestamp) {
  console.error(`No sign-off record found for track ${trackId}`);
  process.exit(1);
}

const sessionId = signOffRecord.session_id || signOffRecord.sessionId;
if (!sessionId) {
  console.error(`Session ID missing from sign-off record for track ${trackId}`);
  process.exit(1);
}

const expectedKey = generateSignKey(sessionId, trackId, signOffRecord.timestamp);

if (signOffRecord.sign_key.length !== expectedKey.length || !crypto.timingSafeEqual(Buffer.from(signOffRecord.sign_key), Buffer.from(expectedKey))) {
  console.error(`Sign key mismatch for track ${trackId}`);
  process.exit(1);
}

const approvalDate = new Date(signOffRecord.timestamp).toISOString();
console.log(`Approved by ${signOffRecord.approved_by || 'user'} at ${approvalDate}`);
process.exit(0);
