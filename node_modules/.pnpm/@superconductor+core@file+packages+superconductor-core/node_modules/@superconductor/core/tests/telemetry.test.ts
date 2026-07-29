import { describe, it, expect, afterEach } from 'vitest';
import { FileTelemetryStore, TokenUsageReport } from '../src/telemetry/index';
import { promises as fs } from 'fs';
import * as path from 'path';

describe('FileTelemetryStore', () => {
    const testLogFile = path.join(__dirname, 'test_telemetry.jsonl');

    afterEach(async () => {
        try {
            await fs.unlink(testLogFile);
        } catch (e: any) {
            if (e.code !== 'ENOENT') throw e;
        }
    });

    it('should record usage to a file in jsonl format', async () => {
        const store = new FileTelemetryStore(testLogFile);
        
        const report: TokenUsageReport = {
            trackId: 'test-track',
            subagentId: 'sub-123',
            stepIndex: 1,
            promptTokens: 100,
            completionTokens: 50,
            timestamp: 1672531200000
        };

        await store.recordUsage(report);

        const content = await fs.readFile(testLogFile, 'utf-8');
        const parsed = JSON.parse(content.trim());
        
        expect(parsed.trackId).toBe('test-track');
        expect(parsed.promptTokens).toBe(100);
    });

    it('should append multiple records', async () => {
        const store = new FileTelemetryStore(testLogFile);
        
        const report1: TokenUsageReport = {
            trackId: 'test-track',
            subagentId: 'sub-1',
            stepIndex: 1,
            promptTokens: 100,
            completionTokens: 50,
            timestamp: 1672531200000
        };

        const report2: TokenUsageReport = {
            trackId: 'test-track',
            subagentId: 'sub-2',
            stepIndex: 2,
            promptTokens: 200,
            completionTokens: 10,
            timestamp: 1672531201000
        };

        await store.recordUsage(report1);
        await store.recordUsage(report2);

        const content = await fs.readFile(testLogFile, 'utf-8');
        const lines = content.trim().split('\n');
        
        expect(lines.length).toBe(2);
        
        const parsed1 = JSON.parse(lines[0]);
        const parsed2 = JSON.parse(lines[1]);
        
        expect(parsed1.subagentId).toBe('sub-1');
        expect(parsed2.subagentId).toBe('sub-2');
    });

    it('should reject negative tokens', async () => {
        const store = new FileTelemetryStore(testLogFile);
        const invalidReport: TokenUsageReport = {
            trackId: 'test',
            subagentId: 'sub',
            stepIndex: 1,
            promptTokens: -10,
            completionTokens: 5,
            timestamp: 123
        };
        await expect(store.recordUsage(invalidReport)).rejects.toThrow("promptTokens must be a non-negative integer");
    });

    it('should reject missing trackId', async () => {
        const store = new FileTelemetryStore(testLogFile);
        const invalidReport: any = {
            subagentId: 'sub',
            stepIndex: 1,
            promptTokens: 10,
            completionTokens: 5,
            timestamp: 123
        };
        await expect(store.recordUsage(invalidReport)).rejects.toThrow("trackId must be a non-empty string");
    });

    it('should redact sensitive information from payload', async () => {
        const store = new FileTelemetryStore(testLogFile);
        
        process.env.GEMINI_API_KEY = 'AIzaSyFakeKey123';
        process.env.GCP_PROJECT_ID = 'secret-project-42';
        process.env.GCP_LOCATION = 'us-central1';

        const report = {
            trackId: 'test-track-AIzaSyFakeKey123',
            subagentId: 'sub-secret-project-42-us-central1',
            stepIndex: 1,
            promptTokens: 100,
            completionTokens: 50,
            timestamp: 123
        };

        await store.recordUsage(report);

        const content = await fs.readFile(testLogFile, 'utf-8');
        const lines = content.trim().split('\n');
        const parsed = JSON.parse(lines[lines.length - 1]);
        
        expect(parsed.trackId).toBe('test-track-[REDACTED]');
        expect(parsed.subagentId).toBe('sub-[REDACTED]-[REDACTED]');
        expect(content).not.toContain('AIzaSyFakeKey123');
        expect(content).not.toContain('secret-project-42');
        expect(content).not.toContain('us-central1');

        delete process.env.GEMINI_API_KEY;
        delete process.env.GCP_PROJECT_ID;
        delete process.env.GCP_LOCATION;
    });
});
