import { resolveRegistry, getSuperconductorHome } from './tool-registry.js';

export function preflight() {
  const home = getSuperconductorHome();
  const registry = resolveRegistry(home);
  
  const available: string[] = [];
  const degraded: string[] = [];
  const unavailable: string[] = [];
  
  console.log('\\n--- Preflight Availability Matrix ---');
  for (const [key, rawCap] of Object.entries(registry.capabilities)) {
    const cap = rawCap as any;
    const icon = cap.status === 'available' ? '✅' : cap.status === 'degraded' ? '⚠️' : '❌';
    console.log(`${icon} ${key}: ${cap.tool || 'none'} (${cap.status})`);
    
    if (cap.status === 'available') available.push(key);
    else if (cap.status === 'degraded') degraded.push(key);
    else unavailable.push(key);
  }
  console.log('-------------------------------------\\n');
  
  return { available, degraded, unavailable };
}
