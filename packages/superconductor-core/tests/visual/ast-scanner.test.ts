import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { VisualAstScanner } from '../../src/visual/ast-scanner.js';

describe('VisualAstScanner', () => {
  let tempDir: string;
  let scanner: VisualAstScanner;

  beforeAll(() => {
    scanner = new VisualAstScanner();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-ast-scanner-test-'));

    // Create directory structure
    fs.mkdirSync(path.join(tempDir, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src/views'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src/utils'), { recursive: true });

    // 1. Function component with typed props interface
    fs.writeFileSync(
      path.join(tempDir, 'src/components/UserProfileCard.tsx'),
      `import React from 'react';

export interface UserProfileCardProps {
  /** Full name of the user */
  name: string;
  /** Short biography text */
  description?: string;
  avatarUrl: string;
  count?: number;
  isActive: boolean;
  onClick: () => void;
}

export function UserProfileCard(props: UserProfileCardProps) {
  return (
    <div onClick={props.onClick}>
      <img src={props.avatarUrl} alt={props.name} />
      <h3>{props.name}</h3>
      <p>{props.description}</p>
      <span>{props.count}</span>
      <span>{props.isActive ? 'Active' : 'Inactive'}</span>
    </div>
  );
}
`
    );

    // 2. Arrow function component with React.FC and default values
    fs.writeFileSync(
      path.join(tempDir, 'src/components/ActionButton.tsx'),
      `import React from 'react';

export interface ActionButtonProps {
  label: string;
  count?: number;
  disabled?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  count = 0,
  disabled = false,
}) => {
  return (
    <button disabled={disabled}>
      {label} ({count})
    </button>
  );
};

export default ActionButton;
`
    );

    // 3. Class component with heritage type argument
    fs.writeFileSync(
      path.join(tempDir, 'src/views/DashboardView.tsx'),
      `import React from 'react';

export interface DashboardViewProps {
  title: string;
  isOpen?: boolean;
}

export class DashboardView extends React.Component<DashboardViewProps> {
  render() {
    return (
      <main>
        <h1>{this.props.title}</h1>
        {this.props.isOpen && <p>Open</p>}
      </main>
    );
  }
}
`
    );

    // 4. Non-UI utility file (should be ignored by scanner)
    fs.writeFileSync(
      path.join(tempDir, 'src/utils/math.ts'),
      `export function add(a: number, b: number): number {
  return a + b;
}

export const PI = 3.14159;
`
    );

    // 5. Test file (should be ignored by default exclude pattern)
    fs.writeFileSync(
      path.join(tempDir, 'src/components/UserProfileCard.test.tsx'),
      `export function MockComponent() {
  return <div>Mock</div>;
}
`
    );
  });

  afterAll(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('synthesizeMockProps', () => {
    it('generates expected default fixtures for standard keys', () => {
      const fixtures = scanner.synthesizeMockProps({
        title: 'string',
        label: 'string',
        name: 'string',
        description: 'string',
        content: 'string',
        count: 'number',
        price: 'number',
        amount: 'number',
        isActive: 'boolean',
        isOpen: 'boolean',
        enabled: 'boolean',
        avatarUrl: 'string',
        imageUrl: 'string',
        src: 'string',
        onClick: '() => void',
        onChange: '(e: any) => void',
        onSubmit: '() => void',
      });

      expect(fixtures.title).toBe('Sample Item');
      expect(fixtures.label).toBe('Sample Item');
      expect(fixtures.name).toBe('Sample Item');
      expect(fixtures.description).toBe('Sample descriptive text for preview.');
      expect(fixtures.content).toBe('Sample descriptive text for preview.');
      expect(fixtures.count).toBe(42);
      expect(fixtures.price).toBe(42);
      expect(fixtures.amount).toBe(42);
      expect(fixtures.isActive).toBe(true);
      expect(fixtures.isOpen).toBe(true);
      expect(fixtures.enabled).toBe(true);
      expect(fixtures.avatarUrl).toBe('https://images.unsplash.com/photo-1534528741775-53994a69daeb');
      expect(fixtures.imageUrl).toBe('https://images.unsplash.com/photo-1534528741775-53994a69daeb');
      expect(fixtures.src).toBe('https://images.unsplash.com/photo-1534528741775-53994a69daeb');

      expect(typeof fixtures.onClick).toBe('function');
      expect(typeof fixtures.onChange).toBe('function');
      expect(typeof fixtures.onSubmit).toBe('function');
      expect((fixtures.onClick as () => void).toString()).toBe('[Function]');
      expect(() => (fixtures.onClick as () => void)()).not.toThrow();
    });

    it('generates smart fallbacks for typed schemas', () => {
      const fixtures = scanner.synthesizeMockProps({
        size: "'sm' | 'md' | 'lg'",
        tags: 'string[]',
        customText: 'string',
        customNumber: 'number',
        customBool: 'boolean',
        customHandler: '() => void',
      });

      expect(fixtures.size).toBe('sm');
      expect(fixtures.tags).toEqual(['Sample Item']);
      expect(fixtures.customText).toBe('Sample text');
      expect(fixtures.customNumber).toBe(42);
      expect(fixtures.customBool).toBe(true);
      expect(typeof fixtures.customHandler).toBe('function');
    });
  });

  describe('scan', () => {
    it('discovers exported UI components and ignores non-UI utilities and test files', async () => {
      const components = await scanner.scan(tempDir);

      const names = components.map((c) => c.name);
      expect(names).toContain('UserProfileCard');
      expect(names).toContain('ActionButton');
      expect(names).toContain('DashboardView');

      // Math utility has no JSX, should not be included
      expect(names).not.toContain('add');
      expect(names).not.toContain('math');

      // Test file should be excluded
      expect(names).not.toContain('MockComponent');
    });

    it('extracts props, types, required flags, and JSDoc comments', async () => {
      const components = await scanner.scan(tempDir);
      const userCard = components.find((c) => c.name === 'UserProfileCard');
      expect(userCard).toBeDefined();

      const nameProp = userCard!.props.find((p) => p.name === 'name');
      expect(nameProp).toBeDefined();
      expect(nameProp!.type).toBe('string');
      expect(nameProp!.required).toBe(true);
      expect(nameProp!.description).toBe('Full name of the user');

      const descProp = userCard!.props.find((p) => p.name === 'description');
      expect(descProp).toBeDefined();
      expect(descProp!.type).toBe('string');
      expect(descProp!.required).toBe(false);
      expect(descProp!.description).toBe('Short biography text');

      const avatarProp = userCard!.props.find((p) => p.name === 'avatarUrl');
      expect(avatarProp).toBeDefined();
      expect(avatarProp!.required).toBe(true);

      const countProp = userCard!.props.find((p) => p.name === 'count');
      expect(countProp).toBeDefined();
      expect(countProp!.required).toBe(false);

      const activeProp = userCard!.props.find((p) => p.name === 'isActive');
      expect(activeProp).toBeDefined();
      expect(activeProp!.required).toBe(true);

      const clickProp = userCard!.props.find((p) => p.name === 'onClick');
      expect(clickProp).toBeDefined();
      expect(clickProp!.required).toBe(true);
    });

    it('detects default values from parameter destructuring', async () => {
      const components = await scanner.scan(tempDir);
      const actionBtn = components.find((c) => c.name === 'ActionButton');
      expect(actionBtn).toBeDefined();

      const labelProp = actionBtn!.props.find((p) => p.name === 'label');
      expect(labelProp).toBeDefined();
      expect(labelProp!.required).toBe(true);

      const countProp = actionBtn!.props.find((p) => p.name === 'count');
      expect(countProp).toBeDefined();
      expect(countProp!.required).toBe(false);
      expect(countProp!.defaultValue).toBe('0');

      const disabledProp = actionBtn!.props.find((p) => p.name === 'disabled');
      expect(disabledProp).toBeDefined();
      expect(disabledProp!.required).toBe(false);
      expect(disabledProp!.defaultValue).toBe('false');
    });

    it('extracts class component props', async () => {
      const components = await scanner.scan(tempDir);
      const dashboard = components.find((c) => c.name === 'DashboardView');
      expect(dashboard).toBeDefined();

      const titleProp = dashboard!.props.find((p) => p.name === 'title');
      expect(titleProp).toBeDefined();
      expect(titleProp!.required).toBe(true);

      const openProp = dashboard!.props.find((p) => p.name === 'isOpen');
      expect(openProp).toBeDefined();
      expect(openProp!.required).toBe(false);
    });

    it('attaches synthesized mock props to scanned components', async () => {
      const components = await scanner.scan(tempDir);
      const userCard = components.find((c) => c.name === 'UserProfileCard');
      expect(userCard).toBeDefined();

      expect(userCard!.mockProps.name).toBe('Sample Item');
      expect(userCard!.mockProps.description).toBe('Sample descriptive text for preview.');
      expect(userCard!.mockProps.avatarUrl).toBe('https://images.unsplash.com/photo-1534528741775-53994a69daeb');
      expect(userCard!.mockProps.count).toBe(42);
      expect(userCard!.mockProps.isActive).toBe(true);
      expect(typeof userCard!.mockProps.onClick).toBe('function');
    });
  });

  describe('generateEntrySnippet', () => {
    it('generates a clean preview entry snippet with imports, mockProps, and JSX', async () => {
      const components = await scanner.scan(tempDir);
      const userCard = components.find((c) => c.name === 'UserProfileCard')!;
      const snippet = scanner.generateEntrySnippet(userCard);

      expect(snippet).toContain("import React from 'react';");
      expect(snippet).toContain("import { UserProfileCard } from");
      expect(snippet).toContain('export const mockProps =');
      expect(snippet).toContain('export default function Preview()');
      expect(snippet).toContain('<UserProfileCard');
      expect(snippet).toContain('name="Sample Item"');
      expect(snippet).toContain('count={42}');
      expect(snippet).toContain('isActive={true}');
    });

    it('generates default import for default export components', async () => {
      const components = await scanner.scan(tempDir);
      const defaultExport = components.find((c) => c.exportType === 'default')!;
      expect(defaultExport).toBeDefined();

      const snippet = scanner.generateEntrySnippet(defaultExport);
      expect(snippet).toContain(`import ${defaultExport.name} from`);
      expect(snippet).not.toContain(`import { ${defaultExport.name} } from`);
    });
  });
});
