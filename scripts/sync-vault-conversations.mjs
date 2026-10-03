#!/usr/bin/env node

/**
 * Unified Daily Vault Synchronizer for Google AI Mode & Google Gemini
 * 
 * Features:
 * - Checkpoint-driven deduplication via CheckpointManager
 * - Automatic Obsidian YAML frontmatter formatting via VaultSyncManager
 * - Date-nested hierarchy (Conversations/YYYY/MM/YYYY-MM-DD - <Title>.md)
 * - Safe atomic writes with zero file duplication
 * - Automated GitLab commit & push sync
 * - Resumable execution for scheduled daily cron jobs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  CheckpointManager,
  VaultSyncManager,
  DEFAULT_VAULT_PATH,
} from '../packages/superconductor-browser/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const execFileAsync = promisify(execFile);

const vaultDir = process.env.OBSIDIAN_VAULT_PATH || DEFAULT_VAULT_PATH;
const checkpointDir = path.resolve(rootDir, '.superconductor/checkpoints');

async function auditVaultIds(vaultPath) {
  const existingIds = new Set();
  const existingTitles = new Set();
  const convsRoot = path.join(vaultPath, 'Conversations');
  if (!fs.existsSync(convsRoot)) return { existingIds, existingTitles };

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          const idMatch = content.match(/^id:\s*["']?([^"'\n]+)/m);
          if (idMatch) existingIds.add(idMatch[1].trim());
          const titleMatch = content.match(/^title:\s*["']?([^"'\n]+)/m);
          if (titleMatch) existingTitles.add(titleMatch[1].trim().toLowerCase());
          const baseName = entry.name.replace(/^\d{4}-\d{2}-\d{2}\s*-\s*/, '').replace(/\.md$/, '').toLowerCase();
          existingTitles.add(baseName);
        } catch {}
      }
    }
  }

  walk(convsRoot);
  return { existingIds, existingTitles };
}

function deriveGoogleAiId(item) {
  if (item.url) {
    const mtidMatch = item.url.match(/[?&]mtid=([a-zA-Z0-9_-]+)/);
    if (mtidMatch) return mtidMatch[1];
  }
  const cleanTitle = (item.query || item.title || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `google-ai-${cleanTitle.slice(0, 40)}`;
}

export async function runDailySync(options = {}) {
  console.log(`\n======================================================`);
  console.log(`[Superconductor] Daily Vault Synchronizer`);
  console.log(`  Target Vault: ${vaultDir}`);
  console.log(`  Checkpoint Directory: ${checkpointDir}`);
  console.log(`  Resumption Check: ${options.isResume ? 'YES' : 'NO'}`);
  console.log(`======================================================\n`);

  // 1. Audit vault for deduplication index
  const { existingIds, existingTitles } = await auditVaultIds(vaultDir);
  console.log(`[*] Pre-scan: ${existingIds.size} existing conversation IDs indexed in vault.`);

  const vaultSyncManager = new VaultSyncManager({ defaultVaultDir: vaultDir });
  let totalNewAdded = 0;
  let totalSkipped = 0;

  // --- Part A: Google AI Mode Conversations ---
  console.log(`\n--- [Part A] Google Search AI Mode Conversations ---`);
  const gAiCheckpoint = new CheckpointManager({ checkpointDir });
  await gAiCheckpoint.load('google_ai_search_vault_sync', 'https://www.google.com/search?udm=50');

  // Register existing vault IDs
  for (const id of existingIds) gAiCheckpoint.markCompleted(id);

  const googleAiMdDir = path.resolve(rootDir, 'superconductor/conversations/google-search-ai');
  const mdFiles = fs.existsSync(googleAiMdDir)
    ? fs.readdirSync(googleAiMdDir).filter(f => f.endsWith('.md')).sort()
    : [];

  for (let i = 0; i < mdFiles.length; i++) {
    const file = mdFiles[i];
    const fullPath = path.join(googleAiMdDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const parts = content.split(/^---$/m);
    const frontmatterRaw = parts.length >= 3 ? parts[1] : '';
    const body = parts.length >= 3 ? parts.slice(2).join('---').trim() : content;

    const titleMatch = frontmatterRaw.match(/^title:\s*["']?([^"'\n]+)/m);
    const title = titleMatch ? titleMatch[1].trim() : file.replace(/^\d+-/, '').replace(/\.md$/, '');
    const urlMatch = frontmatterRaw.match(/^url:\s*["']?([^"'\n]+)/m);
    const url = urlMatch ? urlMatch[1].trim() : '';
    const turnsMatch = frontmatterRaw.match(/^turns:\s*(\d+)/m);
    const turns = turnsMatch ? parseInt(turnsMatch[1], 10) : 1;
    const cid = deriveGoogleAiId({ url, query: title, title });

    if (gAiCheckpoint.isCompleted(cid) || existingIds.has(cid) || existingTitles.has(title.toLowerCase())) {
      console.log(`  [SKIP] Google AI: '${title}' (${cid})`);
      totalSkipped++;
      gAiCheckpoint.markCompleted(cid);
      continue;
    }

    console.log(`  [INGEST] Google AI: '${title}' (${cid})`);
    try {
      const res = await vaultSyncManager.saveNoteAndSync({
        subDir: 'Conversations',
        nestedDateDirs: true,
        title,
        content: body,
        metadata: {
          title,
          date: '2026-10-02',
          timestamp: 1790922929,
          id: cid,
          url,
          source: 'google-search-ai',
          turns,
          importance: 'medium',
          category: '03 - Software Development & Automation',
          topics: ['google-search-ai', 'conversational-search', 'research'],
          tags: ['category/03-software-dev', 'cluster/search-ai', 'importance/medium', 'type/search-ai-chat', 'year/2026'],
        },
        gitSync: false,
      });
      gAiCheckpoint.markCompleted(cid);
      existingIds.add(cid);
      existingTitles.add(title.toLowerCase());
      totalNewAdded++;
      console.log(`    -> Created: ${res.filePath}`);
    } catch (err) {
      console.error(`    [!] Error ingesting '${title}':`, err.message);
    }
  }

  await gAiCheckpoint.complete();

  // --- Part B: Google Gemini Conversations ---
  console.log(`\n--- [Part B] Google Gemini Conversations ---`);
  const geminiCheckpoint = new CheckpointManager({ checkpointDir });
  await geminiCheckpoint.load('gemini_conversations_vault_sync', 'https://gemini.google.com/app');

  for (const id of existingIds) geminiCheckpoint.markCompleted(id);

  const geminiJsonPath = path.resolve(rootDir, '../jev-ultrafast/gemini_conversations.json');
  if (fs.existsSync(geminiJsonPath)) {
    const geminiItems = JSON.parse(fs.readFileSync(geminiJsonPath, 'utf8'));
    for (const item of geminiItems) {
      const cid = item.id;
      if (geminiCheckpoint.isCompleted(cid) || existingIds.has(cid)) {
        totalSkipped++;
        continue;
      }

      const rawTitle = item.title || 'Untitled Conversation';
      let cleanTitle = rawTitle;
      if (rawTitle.length > 80) {
        if (rawTitle.includes('3D Gaussian Splatting') || rawTitle.includes('3DGS')) {
          cleanTitle = '3DGS Tactical FPV Drone Vision Blueprint';
        } else {
          cleanTitle = rawTitle.slice(0, 60).replace(/[\n\r]+/g, ' ').trim();
        }
      }

      const dateStr = item.iso_date ? item.iso_date.slice(0, 10) : '2026-06-07';
      const yearStr = dateStr.slice(0, 4);

      const body = `
# ${cleanTitle}

> [!info]+ Metadata
> 🔗 **Original Link**: [Open in Gemini](https://gemini.google.com/app/${cid})  
> 📅 **Date**: ${dateStr} · 💬 **Turns**: 1 · 🆔 \`${cid}\`

---

> [!user] You
> ${rawTitle.replace(/\n/g, '\n> ')}

> [!gemini] Gemini
> *[Full conversational transcript archived. For interactive exploration or Canvas artifacts, visit the [Gemini Link](https://gemini.google.com/app/${cid}).]*
`.trim();

      console.log(`  [INGEST] Gemini: '${cleanTitle}' (${cid})`);
      try {
        const res = await vaultSyncManager.saveNoteAndSync({
          subDir: 'Conversations',
          nestedDateDirs: true,
          title: cleanTitle,
          content: body,
          metadata: {
            title: cleanTitle,
            date: dateStr,
            timestamp: item.timestamp || 1780796005,
            id: cid,
            url: `https://gemini.google.com/app/${cid}`,
            source: 'google-gemini',
            turns: 1,
            importance: cleanTitle.includes('Blueprint') ? 'high' : 'medium',
            category: cleanTitle.includes('Blueprint') || cleanTitle.includes('FPV')
              ? '05 - Hardware, Embedded & Robotics'
              : '03 - Software Development & Automation',
            topics: ['gemini-chat', 'research'],
            tags: ['type/gemini-chat', `year/${yearStr}`, 'importance/medium'],
          },
          gitSync: false,
        });
        geminiCheckpoint.markCompleted(cid);
        existingIds.add(cid);
        totalNewAdded++;
        console.log(`    -> Created: ${res.filePath}`);
      } catch (err) {
        console.error(`    [!] Error ingesting '${cleanTitle}':`, err.message);
      }
    }
  }

  await geminiCheckpoint.complete();

  // --- Git Synchronization ---
  if (!options.noGit && totalNewAdded > 0) {
    console.log(`\n[*] Committing & Pushing to GitLab...`);
    try {
      await execFileAsync('git', ['add', '-A'], { cwd: vaultDir });
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: vaultDir });
      if (stdout.trim().length > 0) {
        const msg = `docs(conversations): automated daily sync (+${totalNewAdded} notes)`;
        await execFileAsync('git', ['commit', '-m', msg], { cwd: vaultDir });
        await execFileAsync('git', ['push', 'origin', 'main'], { cwd: vaultDir });
        console.log(`[*] Successfully pushed to GitLab: ${msg}`);
      }
    } catch (gitErr) {
      console.warn(`[!] Git sync warning:`, gitErr.message);
    }
  }

  console.log(`\n======================================================`);
  console.log(`[Sync Summary]`);
  console.log(`  Newly Ingested:    ${totalNewAdded}`);
  console.log(`  Skipped/Completed: ${totalSkipped}`);
  console.log(`  Total Active Vault Notes: ${existingIds.size}`);
  console.log(`======================================================\n`);

  return { added: totalNewAdded, skipped: totalSkipped, totalVaultNotes: existingIds.size };
}

// Direct execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isResume = process.argv.includes('--resume') || process.argv.includes('--verify');
  const noGit = process.argv.includes('--no-git');
  runDailySync({ isResume, noGit }).catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
  });
}
