import * as fs from 'fs';
import * as path from 'path';

export class SkillPortingEngine {
  public static portSkill(inputDir: string, outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const inputSkillMdPath = path.join(inputDir, 'SKILL.md');
    if (!fs.existsSync(inputSkillMdPath)) {
      throw new Error(`SKILL.md not found in ${inputDir}`);
    }

    const content = fs.readFileSync(inputSkillMdPath, 'utf-8');
    
    // Parse frontmatter
    let frontmatter = '';
    let body = content;
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);
    
    let name = path.basename(inputDir);
    let description = 'Ported skill';
    
    if (match) {
      frontmatter = match[1];
      body = match[2].trim();
      
      const nameMatch = frontmatter.match(/name:\s*(.*)/);
      if (nameMatch) name = nameMatch[1].trim();
      
      const descMatch = frontmatter.match(/description:\s*(.*)/);
      if (descMatch) description = descMatch[1].trim();
    }

    // Rename grill-with-docs to grill if necessary
    if (name === 'grill-with-docs') {
      name = 'grill';
    } else if (name === 'improve-codebase-architecture') {
      name = 'improve-architecture';
    }

    const newSkillMdContent = `---
name: ${name}
description: ${description}
---

## 1.0 SYSTEM DIRECTIVE
You are an AI agent assistant for the Superconductor spec-driven development framework. Your current task is to execute the ${name} skill. You MUST follow this protocol precisely.

CRITICAL: You must validate the success of every tool call. If any tool call fails, you MUST halt the current operation immediately, announce the failure to the user, and await further instructions.

## 2.0 SKILL INSTRUCTIONS
${body}
`;

    const outputSkillMdPath = path.join(outputDir, 'SKILL.md');
    fs.writeFileSync(outputSkillMdPath, newSkillMdContent);
    console.log(`Ported skill ${name} to ${outputSkillMdPath}`);
    
    // Copy any other .md files if they exist (like HTML-REPORT.md)
    const files = fs.readdirSync(inputDir);
    for (const file of files) {
      if (file.endsWith('.md') && file !== 'SKILL.md') {
        fs.copyFileSync(path.join(inputDir, file), path.join(outputDir, file));
        console.log(`Copied ${file} to ${outputDir}`);
      }
    }
  }
}
