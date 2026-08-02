import { SkillPortingEngine } from '../packages/engine/src/skills/SkillPortingEngine';
import * as path from 'path';

const mattPocockSkillsDir = '/tmp/mattpocock-skills/skills/engineering';
const targetDir = path.join(__dirname, '../skills');

SkillPortingEngine.portSkill(path.join(mattPocockSkillsDir, 'grill-with-docs'), path.join(targetDir, 'grill'));
SkillPortingEngine.portSkill(path.join(mattPocockSkillsDir, 'improve-codebase-architecture'), path.join(targetDir, 'improve-architecture'));
