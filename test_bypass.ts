import { RogueWriteGuard } from './packages/engine/src/guard/rogue-write-guard.js';

const guard = new RogueWriteGuard('root');

try {
  guard.assertWriteAllowed('/absolute/path/packages/engine/src/index.ts');
  console.log("BYPASS 1 (Absolute Path) SUCCESS!");
} catch(e) {
  console.log("BYPASS 1 FAILED (Blocked correctly)");
}

try {
  guard.assertWriteAllowed('../superconductor/packages/engine/src/index.ts');
  console.log("BYPASS 2 (../ Path) SUCCESS!");
} catch(e) {
  console.log("BYPASS 2 FAILED (Blocked correctly)");
}
