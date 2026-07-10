import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Dispatcher } from '../src/dispatcher/dispatcher.js';
import { DagNode } from '../src/types/dag.types.js';

describe('Dispatcher', () => {
  let dispatcher: Dispatcher;

  beforeEach(() => {
    dispatcher = new Dispatcher();
  });

  describe('Model tier routing', () => {
    it('maps TaskTier 1 to script/regex model spec', () => {
      const config = dispatcher.getTierConfig(1);
      expect(config.model).toBe('script/regex');
    });

    it('maps TaskTier 2 to flash model spec', () => {
      const config = dispatcher.getTierConfig(2);
      expect(config.model).toBe('flash');
    });

    it('maps TaskTier 3 to pro model spec', () => {
      const config = dispatcher.getTierConfig(3);
      expect(config.model).toBe('pro');
    });

    it('maps TaskTier 4 to oracle model spec', () => {
      const config = dispatcher.getTierConfig(4);
      expect(config.model).toBe('oracle');
    });
  });

  describe('Event emission', () => {
    it('emits task_started when a subagent is spawned', async () => {
      const node: DagNode = {
        id: 'task-1',
        role: 'architect',
        tier: 2,
        status: 'pending',
        prompt: 'Build a house'
      };

      const onEvent = vi.fn();
      dispatcher.on('event', onEvent);

      const dispatchPromise = dispatcher.dispatch(node);
      
      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'task_started',
        taskId: 'task-1'
      }));

      await dispatchPromise;
    });

    it('emits task_completed with outputs when a subagent finishes successfully', async () => {
      const node: DagNode = {
        id: 'task-2',
        role: 'editor',
        tier: 1,
        status: 'pending',
        prompt: 'Fix a typo'
      };

      vi.spyOn(dispatcher as any, 'simulateExecution').mockResolvedValue({
        agentId: 'agent-123',
        status: 'success',
        output: 'Done'
      });

      const onEvent = vi.fn();
      dispatcher.on('event', onEvent);

      await dispatcher.dispatch(node);
      
      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'task_completed',
        taskId: 'task-2',
        payload: expect.objectContaining({
          status: 'success',
          output: 'Done'
        })
      }));
    });

    it('emits task_failed with error details when a subagent fails/crashes', async () => {
      const node: DagNode = {
        id: 'task-3',
        role: 'architect',
        tier: 3,
        status: 'pending',
        prompt: 'Fail me'
      };

      vi.spyOn(dispatcher as any, 'simulateExecution').mockResolvedValue({
        agentId: 'agent-456',
        status: 'failure',
        output: '',
        error: 'Crashed out of memory'
      });

      const onEvent = vi.fn();
      dispatcher.on('event', onEvent);

      await dispatcher.dispatch(node);
      
      expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({
        type: 'task_failed',
        taskId: 'task-3',
        payload: expect.objectContaining({
          status: 'failure',
          error: 'Crashed out of memory'
        })
      }));
    });
  });
});
