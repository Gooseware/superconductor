import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CliDispatcher } from '../../src/cli/dispatcher.js';

describe('CliDispatcher', () => {
  let mockInteractiveOrchestrator: { run: ReturnType<typeof vi.fn> };
  let mockHeadlessOrchestrator: { run: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockInteractiveOrchestrator = { run: vi.fn().mockResolvedValue({ mode: 'interactive' }) };
    mockHeadlessOrchestrator = { run: vi.fn().mockResolvedValue({ mode: 'headless' }) };
  });

  describe('TTY vs Headless Routing', () => {
    it('routes to InteractiveOrchestrator when environment is TTY and no explicit flags are given', async () => {
      const dispatcher = new CliDispatcher({
        isTTY: true,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
      });

      const result = await dispatcher.run(['track-1']);

      expect(mockInteractiveOrchestrator.run).toHaveBeenCalledWith(['track-1']);
      expect(mockHeadlessOrchestrator.run).not.toHaveBeenCalled();
      expect(result).toEqual({ mode: 'interactive' });
    });

    it('routes to HeadlessOrchestrator when environment is non-TTY and no explicit flags are given', async () => {
      const dispatcher = new CliDispatcher({
        isTTY: false,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
      });

      const result = await dispatcher.run(['track-1']);

      expect(mockHeadlessOrchestrator.run).toHaveBeenCalledWith(['track-1']);
      expect(mockInteractiveOrchestrator.run).not.toHaveBeenCalled();
      expect(result).toEqual({ mode: 'headless' });
    });
  });

  describe('Explicit Flag Overrides', () => {
    it('forces HeadlessOrchestrator when --headless flag is present, even in TTY environment', async () => {
      const dispatcher = new CliDispatcher({
        isTTY: true,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
      });

      const result = await dispatcher.run(['--headless', 'track-1']);

      expect(mockHeadlessOrchestrator.run).toHaveBeenCalledWith(['--headless', 'track-1']);
      expect(mockInteractiveOrchestrator.run).not.toHaveBeenCalled();
      expect(result).toEqual({ mode: 'headless' });
    });

    it('forces InteractiveOrchestrator when --interactive flag is present, even in non-TTY environment', async () => {
      const dispatcher = new CliDispatcher({
        isTTY: false,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
      });

      const result = await dispatcher.run(['--interactive', 'track-1']);

      expect(mockInteractiveOrchestrator.run).toHaveBeenCalledWith(['--interactive', 'track-1']);
      expect(mockHeadlessOrchestrator.run).not.toHaveBeenCalled();
      expect(result).toEqual({ mode: 'interactive' });
    });
  });

  describe('Default Orchestrator Imports', () => {
    it('uses real/stub InteractiveOrchestrator module when none injected in TTY mode', async () => {
      const dispatcher = new CliDispatcher({ isTTY: true });
      const result = await dispatcher.run(['track-default']);
      expect(result.mode).toBe('interactive');
    });

    it('uses real/stub HeadlessOrchestrator module when none injected in non-TTY mode', async () => {
      const dispatcher = new CliDispatcher({
        isTTY: false,
        headlessOrchestrator: mockHeadlessOrchestrator,
      });
      const result = await dispatcher.run(['track-default']);
      expect(result).toEqual({ mode: 'headless' });
    });
  });

  describe('Static Helper run Method', () => {
    it('executes via static run helper method', async () => {
      const result = await CliDispatcher.run(['track-2'], {
        isTTY: true,
        interactiveOrchestrator: mockInteractiveOrchestrator,
        headlessOrchestrator: mockHeadlessOrchestrator,
      });

      expect(mockInteractiveOrchestrator.run).toHaveBeenCalledWith(['track-2']);
      expect(result).toEqual({ mode: 'interactive' });
    });
  });
});
