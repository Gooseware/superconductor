import { MutationReport, SurvivingMutant, MutationScore } from './mutation.types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class MutationAnalyzer {
  private threshold: number;

  constructor(threshold: number = 80) {
    this.threshold = threshold;
  }

  async runStryker(filePath: string): Promise<any> {
    // In a real implementation, this would execute Stryker using execAsync
    // and read the resulting JSON report. 
    // For this implementation, we rely on the mock in tests.
    /*
    await execAsync(`npx stryker run --mutate ${filePath}`);
    const reportStr = fs.readFileSync('reports/mutation/mutation.json', 'utf-8');
    return JSON.parse(reportStr);
    */
    throw new Error('Not implemented: mock should intercept this');
  }

  async analyzeFile(filePath: string): Promise<MutationReport> {
    const output = await this.runStryker(filePath);
    
    let total = 0;
    let killed = 0;
    let survived = 0;
    const survivingMutants: SurvivingMutant[] = [];

    if (output && output.files) {
      for (const [file, fileData] of Object.entries<any>(output.files)) {
        if (fileData.mutants) {
          for (const mutant of fileData.mutants) {
            total++;
            if (mutant.status === 'Killed') {
              killed++;
            } else if (mutant.status === 'Survived') {
              survived++;
              survivingMutants.push({
                id: mutant.id,
                mutatorName: mutant.mutatorName || 'Unknown',
                fileName: file,
                location: mutant.location,
                replacement: mutant.replacement || ''
              });
            }
          }
        }
      }
    }

    const scorePct = total > 0 ? (killed / total) * 100 : 100;
    
    const score: MutationScore = {
      total,
      killed,
      survived,
      score: scorePct
    };

    return {
      score,
      survivingMutants,
      suggestions: survivingMutants.map(m => `Write a test that fails when ${m.mutatorName} mutates ${m.fileName} at line ${m.location?.start?.line} to "${m.replacement}"`)
    };
  }

  async verifyThreshold(filePath: string): Promise<{ passed: boolean; report: MutationReport; feedback: string[] }> {
    const report = await this.analyzeFile(filePath);
    const passed = report.score.score >= this.threshold;
    const feedback: string[] = [];

    if (!passed) {
      feedback.push(`Mutation score ${report.score.score}% is below the required threshold of ${this.threshold}%`);
      feedback.push(...report.suggestions);
    }

    return {
      passed,
      report,
      feedback
    };
  }
}
