#!/usr/bin/env node

import { Engine } from './engine.js';
import { parseArgs } from 'util';
import fs from 'fs';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    headless: {
      type: 'boolean',
      short: 'h',
    },
    graph: {
      type: 'string',
      short: 'g',
    },
    context: {
      type: 'string',
      short: 'c',
    }
  },
});

async function main() {
  if (!values.graph) {
    console.error('Please provide a task graph YAML file via --graph <path>');
    process.exit(1);
  }

  const graphContent = fs.readFileSync(values.graph, 'utf-8');
  // Assuming parser is implemented and exported elsewhere
  const { parseYamlDag } = await import('./dag/parser.js');
  const resultParse = parseYamlDag(graphContent);
  if (!resultParse.success) {
    console.error('Failed to parse graph:', resultParse.errors);
    process.exit(1);
  }
  const graph = resultParse.graph;

  const engine = new Engine(graph, {
    headless: values.headless || false,
    commonContext: values.context ? fs.readFileSync(values.context, 'utf-8') : ''
  });

  console.log(`Starting engine in ${values.headless ? 'headless' : 'interactive'} mode...`);

  const result = await engine.execute();
  if (result.success) {
    console.log('Execution completed successfully.');
    process.exit(0);
  } else {
    console.error('Execution failed.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
