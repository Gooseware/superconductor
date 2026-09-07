import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerOpenError } from '../circuit-breaker.js';

describe('CircuitBreaker', () => {
  let currentTime: number;
  const mockClock = () => currentTime;

  beforeEach(() => {
    currentTime = 1000000;
  });

  it('should initialize with CLOSED state and default options', () => {
    const breaker = new CircuitBreaker({ name: 'test-service', clock: mockClock });
    expect(breaker.name).toBe('test-service');
    expect(breaker.failureThreshold).toBe(2);
    expect(breaker.cooldownMs).toBe(60000);
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.isOpen()).toBe(false);
  });

  it('should execute action successfully when CLOSED', async () => {
    const breaker = new CircuitBreaker({ name: 'test-service', clock: mockClock });
    const action = vi.fn().mockResolvedValue('success-result');

    const result = await breaker.execute(action);

    expect(result).toBe('success-result');
    expect(action).toHaveBeenCalledTimes(1);
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.isOpen()).toBe(false);
  });

  it('should stay CLOSED after a single failure when failureThreshold is 2', async () => {
    const breaker = new CircuitBreaker({ name: 'test-service', failureThreshold: 2, clock: mockClock });
    const action = vi.fn().mockRejectedValue(new Error('transient error'));

    await expect(breaker.execute(action)).rejects.toThrow('transient error');
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.isOpen()).toBe(false);
  });

  it('should reset failure count upon successful execution in CLOSED state', async () => {
    const breaker = new CircuitBreaker({ name: 'test-service', failureThreshold: 2, clock: mockClock });
    
    // 1 failure
    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');

    // 1 success resets counter
    breaker.recordSuccess();
    expect(breaker.getState()).toBe('CLOSED');

    // another single failure should NOT trip it
    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should trip from CLOSED to OPEN after 2 consecutive failures (Invariant 2)', async () => {
    const breaker = new CircuitBreaker({ name: 'test-service', failureThreshold: 2, clock: mockClock });

    breaker.recordFailure();
    expect(breaker.getState()).toBe('CLOSED');

    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.isOpen()).toBe(true);
  });

  it('should reject immediately with CircuitBreakerOpenError when OPEN and no fallback provided', async () => {
    const breaker = new CircuitBreaker({ name: 'test-service', failureThreshold: 2, clock: mockClock });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    const action = vi.fn().mockResolvedValue('should not run');

    await expect(breaker.execute(action)).rejects.toThrow(CircuitBreakerOpenError);
    expect(action).not.toHaveBeenCalled();
  });

  it('should execute fallback immediately when OPEN', async () => {
    const breaker = new CircuitBreaker({ name: 'test-service', failureThreshold: 2, clock: mockClock });
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen()).toBe(true);

    const action = vi.fn().mockResolvedValue('action-result');
    const fallback = vi.fn().mockResolvedValue('fallback-result');

    const result = await breaker.execute(action, fallback);

    expect(result).toBe('fallback-result');
    expect(action).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('should transition to HALF_OPEN after cooldown period elapses (Invariant 2: 60s cooldown)', async () => {
    const breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 2,
      cooldownMs: 60000,
      clock: mockClock
    });

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');

    // Advance clock by 59,999 ms (cooldown not yet met)
    currentTime += 59999;
    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.isOpen()).toBe(true);

    // Advance clock to 60,000 ms (cooldown met)
    currentTime += 1;
    expect(breaker.getState()).toBe('HALF_OPEN');
    expect(breaker.isOpen()).toBe(false);
  });

  it('should transition from HALF_OPEN back to CLOSED on successful probe execution', async () => {
    const breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 2,
      cooldownMs: 60000,
      clock: mockClock
    });

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');

    currentTime += 60000;
    expect(breaker.getState()).toBe('HALF_OPEN');

    const probeAction = vi.fn().mockResolvedValue('probe-success');
    const result = await breaker.execute(probeAction);

    expect(result).toBe('probe-success');
    expect(probeAction).toHaveBeenCalledTimes(1);
    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.isOpen()).toBe(false);
  });

  it('should re-trip from HALF_OPEN back to OPEN on probe failure and reset cooldown', async () => {
    const breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 2,
      cooldownMs: 60000,
      clock: mockClock
    });

    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe('OPEN');

    // Enter HALF_OPEN
    currentTime += 60000;
    expect(breaker.getState()).toBe('HALF_OPEN');

    const probeAction = vi.fn().mockRejectedValue(new Error('probe failed'));
    await expect(breaker.execute(probeAction)).rejects.toThrow('probe failed');

    expect(breaker.getState()).toBe('OPEN');
    expect(breaker.isOpen()).toBe(true);

    // Cooldown must have been reset to the probe failure time
    currentTime += 30000;
    expect(breaker.getState()).toBe('OPEN');

    currentTime += 30000;
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('should invoke fallback and trip when execute fails in CLOSED or HALF_OPEN state', async () => {
    const breaker = new CircuitBreaker({ name: 'test-service', failureThreshold: 1, clock: mockClock });
    const action = vi.fn().mockRejectedValue(new Error('action exploded'));
    const fallback = vi.fn().mockResolvedValue('handled-fallback');

    const result = await breaker.execute(action, fallback);

    expect(result).toBe('handled-fallback');
    expect(breaker.getState()).toBe('OPEN');
  });
});
