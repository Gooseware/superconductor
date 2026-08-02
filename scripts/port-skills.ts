import { SkillPortingEngine } from '../packages/engine/src/skills/SkillPortingEngine';
import * as path from 'path';
import * as fs from 'fs';

const mattPocockSkillsDir = process.argv[2] || '/tmp/mattpocock-skills/skills/engineering';

if (!fs.existsSync(mattPocockSkillsDir)) {
  console.error(`Error: Source directory does not exist: ${mattPocockSkillsDir}`);
  process.exit(1);
}

const targetDir = path.join(__dirname, '../skills');

SkillPortingEngine.portSkill(path.join(mattPocockSkillsDir, 'grill-with-docs'), path.join(targetDir, 'grill'));
SkillPortingEngine.portSkill(path.join(mattPocockSkillsDir, 'improve-codebase-architecture'), path.join(targetDir, 'improve-architecture'));
SkillPortingEngine.portSkill(path.join(mattPocockSkillsDir, 'to-tickets'), path.join(targetDir, 'to-tickets'));
SkillPortingEngine.portSkill(path.join(mattPocockSkillsDir, 'to-spec'), path.join(targetDir, 'to-spec'));
