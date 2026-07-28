import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

export class SemanticCache<T> {
    private namespace: string;
    private similarityThreshold: number;
    private basePath: string;

    constructor(
        namespace: string, 
        similarityThreshold = 0.85, 
        baseDir?: string
    ) {
        this.namespace = namespace;
        this.similarityThreshold = similarityThreshold;
        // Default to project root or similar. 
        // For MVP, we use .superconductor/cache or a provided baseDir
        this.basePath = baseDir 
            ? path.join(baseDir, this.namespace)
            : path.join(process.cwd(), '.superconductor', 'cache', this.namespace);
    }

    private getHash(query: string): string {
        return crypto.createHash('sha256').update(query).digest('hex');
    }

    private getFilePath(query: string): string {
        const hash = this.getHash(query);
        return path.join(this.basePath, `${hash}.json`);
    }

    private async ensureDir(): Promise<void> {
        try {
            await fs.mkdir(this.basePath, { recursive: true });
        } catch (error) {
            // ignore
        }
    }

    public async get(query: string, options?: { refresh?: boolean }): Promise<T | null> {
        if (options?.refresh) {
            return null;
        }

        const filePath = this.getFilePath(query);
        try {
            const data = await fs.readFile(filePath, 'utf-8');
            const parsed = JSON.parse(data);
            return parsed.value;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    public async set(query: string, value: T): Promise<void> {
        await this.ensureDir();
        const filePath = this.getFilePath(query);
        const data = JSON.stringify({
            query,
            value,
            timestamp: Date.now()
        }, null, 2);
        await fs.writeFile(filePath, data, 'utf-8');
    }

    public async invalidate(query: string): Promise<void> {
        const filePath = this.getFilePath(query);
        try {
            await fs.unlink(filePath);
        } catch (error: any) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
    }
}
