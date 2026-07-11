import { EventEmitter } from 'events';
import { VlmAuditor } from './vlm-auditor.js';
import { MutationAnalyzer } from './mutation-analyzer.js';
import { validatePbtUsage } from './pbt-validator.js';
import { VerificationEngineEvent } from '../types/events.js';
import { AuditEvent } from './vlm-auditor.types.js';
import { PbtEvent } from './pbt.types.js';
import { MutationEvent } from './mutation.types.js';

export interface VerificationPipelineResult {
  passed: boolean;
  feedback: string[];
}

export interface VerificationPipelineConfig {
  headless?: boolean;
}

export class VerificationPipeline {
  constructor(
    private emitter: EventEmitter,
    private vlmAuditor: VlmAuditor,
    private mutationAnalyzer: MutationAnalyzer,
    private config: VerificationPipelineConfig = {}
  ) {}

  async parseCoverage(): Promise<{ passed: boolean; coverage: number; feedback?: string[] }> {
    // This is a stub for parsing istanbul/clover output.
    // Real implementation would read coverage/coverage-summary.json
    return { passed: true, coverage: 100 };
  }

  async runPhaseCheckpoint(phaseName: string): Promise<{ passed: boolean; requiresManualVerification: boolean; escalated?: boolean; feedback?: string[] }> {
    if (!this.config.headless) {
      return { passed: true, requiresManualVerification: true };
    }

    const coverageResult = await this.parseCoverage();
    if (coverageResult.passed && coverageResult.coverage >= 80) {
      return { passed: true, requiresManualVerification: false };
    }

    return { 
      passed: false, 
      requiresManualVerification: false, 
      escalated: true, 
      feedback: coverageResult.feedback || [`Coverage is below threshold: ${coverageResult.coverage}%`] 
    };
  }

  async runVerification(
    taskId: string,
    componentName: string,
    filePath: string,
    fileContent: string,
    pbtInScopeModules: string[]
  ): Promise<VerificationPipelineResult> {
    const feedback: string[] = [];
    let allPassed = true;

    // 1. PBT Validation
    const pbtResult = validatePbtUsage(fileContent, filePath, pbtInScopeModules);
    
    const pbtEventDetail: PbtEvent = {
      subType: 'pbt_validation',
      timestamp: Date.now(),
      taskId,
      moduleId: filePath,
      result: pbtResult
    };
    this.emitter.emit('event', {
      type: 'verification',
      timestamp: Date.now(),
      detail: pbtEventDetail
    } as VerificationEngineEvent);

    if (!pbtResult.passed) {
      allPassed = false;
      feedback.push(...pbtResult.feedback);
    }

    // 2. Mutation Testing
    let mutationResult;
    try {
      mutationResult = await this.mutationAnalyzer.verifyThreshold(filePath);
      
      const mutationEventDetail: MutationEvent = {
        subType: 'mutation_testing',
        timestamp: Date.now(),
        taskId,
        report: mutationResult.report
      };
      this.emitter.emit('event', {
        type: 'verification',
        timestamp: Date.now(),
        detail: mutationEventDetail
      } as VerificationEngineEvent);

      if (!mutationResult.passed) {
        allPassed = false;
        feedback.push(...mutationResult.feedback);
      }
    } catch (e: any) {
      // Mock error, or real execution failure
      allPassed = false;
      feedback.push(`Mutation analysis failed: ${e.message}`);
    }

    // 3. VLM Audit
    try {
      const vlmResult = await this.vlmAuditor.iterativeAuditFix(
        `http://localhost:3000/${componentName}`,
        componentName,
        async (suggestions) => {
          // In a real integration, this would trigger the agent to apply fixes
        }
      );

      const auditEventDetail: AuditEvent = {
        subType: 'vlm_audit',
        timestamp: Date.now(),
        taskId,
        componentName: componentName,
        result: vlmResult
      };
      this.emitter.emit('event', {
        type: 'verification',
        timestamp: Date.now(),
        detail: auditEventDetail
      } as VerificationEngineEvent);

      if (!vlmResult.passed) {
        allPassed = false;
        feedback.push(...(vlmResult.suggestions || []));
      }
    } catch (e: any) {
      allPassed = false;
      feedback.push(`VLM audit failed: ${e.message}`);
    }

    return {
      passed: allPassed,
      feedback
    };
  }
}
