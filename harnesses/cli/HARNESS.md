# Universal CLI Harness Adapter

## Overview

The Universal CLI adapter allows headless execution and CI/CD automation without any specific AI harness required.

## Commands

```bash
# Get agent context bundle (JSON or human summary)
npx superconductor context [--json]

# Query track status
npx superconductor track status [<track_id>]

# Run code review panel
npx superconductor review [--staged|--branch <b>|--pr <url>]

# Setup machine tool capability registry
npx superconductor setup [--reset-registry]

# Run codebase intelligence pipeline
npx superconductor intelligence [--brownfield] [--target <path>]
```
