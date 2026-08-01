import path from 'path';
import { RogueWriteGuard } from './packages/engine/dist/guard/rogue-write-guard.js';

const guard = new RogueWriteGuard('root');
try {
  guard.assertWriteAllowed('../packages/engine/src/foo.ts');
  console.log('Bypass successful for ../packages');
} catch (e) {
  console.log('Bypass failed', e.message);
}
try {
  guard.assertWriteAllowed('foo/../../packages/engine/src/foo.ts');
  console.log('Bypass successful for foo/../../packages');
} catch (e) {
  console.log('Bypass failed', e.message);
}
