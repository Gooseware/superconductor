import * as path from 'node:path';
import fg from 'fast-glob';
import {
  Project,
  SyntaxKind,
  Node,
  SourceFile,
  FunctionDeclaration,
  ArrowFunction,
  FunctionExpression,
  ClassDeclaration,
  VariableDeclaration,
} from 'ts-morph';

export interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

export interface ScannedComponent {
  name: string;
  filePath: string;
  exportType: 'named' | 'default';
  props: ComponentProp[];
  mockProps: Record<string, unknown>;
  hasJsx: boolean;
  relativePath?: string;
}

export interface ScannerOptions {
  patterns?: string[];
  exclude?: string[];
}

const DEFAULT_PATTERNS = [
  'src/components/**/*.{tsx,jsx}',
  'src/views/**/*.{tsx,jsx}',
  'src/pages/**/*.{tsx,jsx}',
  'components/**/*.{tsx,jsx}',
  'views/**/*.{tsx,jsx}',
  'pages/**/*.{tsx,jsx}',
  'src/**/*.{tsx,jsx}',
];

const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/*.test.{tsx,jsx,ts,js}',
  '**/*.spec.{tsx,jsx,ts,js}',
  '**/__tests__/**',
  '**/stories/**',
  '**/*.stories.{tsx,jsx,ts,js}',
];

function createMockFunction(name: string = 'mockFunction') {
  const fn = (..._args: unknown[]) => {};
  Object.defineProperty(fn, 'name', { value: name, configurable: true });
  fn.toString = () => '[Function]';
  return fn;
}

function cleanTypeText(typeText: string): string {
  if (!typeText) return 'any';
  return typeText
    .replace(/import\([^)]+\)\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferNameFromFile(filePath: string): string {
  const parsed = path.parse(filePath);
  let base = parsed.name;
  if (base.toLowerCase() === 'index') {
    const parentDir = path.basename(parsed.dir);
    if (parentDir && parentDir !== '.' && parentDir !== '/') {
      base = parentDir;
    }
  }
  const pascal = base
    .replace(/[-_]([a-z0-9])/gi, (_, char) => char.toUpperCase())
    .replace(/^([a-z])/, (_, char) => char.toUpperCase());
  return /^[A-Z][a-zA-Z0-9]*$/.test(pascal) ? pascal : 'Component';
}

function hasJsx(node: Node): boolean {
  if (
    node.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxFragment).length > 0
  ) {
    return true;
  }

  if (
    Node.isFunctionDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node)
  ) {
    const returnType = node.getReturnType().getText();
    if (/JSX\.Element|ReactElement|ReactNode/.test(returnType)) {
      return true;
    }
  }

  if (Node.isClassDeclaration(node)) {
    const renderMethod = node.getMethod('render');
    if (renderMethod && hasJsx(renderMethod)) {
      return true;
    }
    const heritage = node.getHeritageClauses();
    for (const h of heritage) {
      if (h.getText().includes('Component')) {
        return true;
      }
    }
  }

  return false;
}

export class VisualAstScanner {
  /**
   * Scans a project directory for UI components returning JSX and extracts their prop schemas.
   */
  async scan(projectRoot: string, options?: ScannerOptions): Promise<ScannedComponent[]> {
    const root = path.resolve(projectRoot);
    const patterns = options?.patterns && options.patterns.length > 0 ? options.patterns : DEFAULT_PATTERNS;
    const ignore = options?.exclude ? [...DEFAULT_EXCLUDES, ...options.exclude] : DEFAULT_EXCLUDES;

    const matchedFiles = await fg(patterns, {
      cwd: root,
      absolute: true,
      ignore,
      onlyFiles: true,
    });

    const uniqueFiles = Array.from(new Set(matchedFiles));
    if (uniqueFiles.length === 0) {
      return [];
    }

    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        jsx: 1, // JsxEmit.Preserve
        target: 99, // ScriptTarget.ESNext
      },
    });

    const sourceFiles: SourceFile[] = [];
    for (const file of uniqueFiles) {
      try {
        const sf = project.addSourceFileAtPath(file);
        sourceFiles.push(sf);
      } catch {
        // Skip unparseable files
      }
    }

    const results: ScannedComponent[] = [];

    for (const sourceFile of sourceFiles) {
      const filePath = sourceFile.getFilePath().replace(/\\/g, '/');
      const relativePath = path.relative(root, filePath).replace(/\\/g, '/');

      try {
        const exportedDeclarations = sourceFile.getExportedDeclarations();

        for (const [exportName, declarations] of exportedDeclarations) {
          for (const decl of declarations) {
            const componentInfo = this.inspectDeclaration(decl, exportName, filePath, sourceFile);
            if (componentInfo) {
              const props = this.extractProps(componentInfo.node, sourceFile, componentInfo.varDecl);
              const propsSchema: Record<string, string> = {};
              for (const p of props) {
                propsSchema[p.name] = p.type;
              }
              const mockProps = this.synthesizeMockProps(propsSchema);

              results.push({
                name: componentInfo.name,
                filePath,
                exportType: componentInfo.exportType,
                props,
                mockProps,
                hasJsx: true,
                relativePath,
              });
            }
          }
        }
      } catch {
        // Guard against file-level AST errors
      }
    }

    return results;
  }

  /**
   * Synthesizes smart mock props for previewing components in Vite harnesses.
   */
  synthesizeMockProps(propsSchema: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [propName, typeStr] of Object.entries(propsSchema)) {
      result[propName] = this.synthesizeSingleProp(propName, typeStr);
    }

    return result;
  }

  /**
   * Generates a preview entry snippet importing and rendering the scanned component with mock fixtures.
   */
  generateEntrySnippet(component: ScannedComponent): string {
    const { name, filePath, exportType, mockProps } = component;
    const safeName =
      name && name !== 'default' && /^[A-Z][a-zA-Z0-9]*$/.test(name)
        ? name
        : inferNameFromFile(filePath);

    const importPath = filePath.replace(/\\/g, '/');
    const importStatement =
      exportType === 'default'
        ? `import ${safeName} from '${importPath}';`
        : `import { ${safeName} } from '${importPath}';`;

    const propsEntries = Object.entries(mockProps || {});

    const mockPropsFormatted =
      propsEntries.length === 0
        ? '{}'
        : `{\n${propsEntries
            .map(([k, v]) => {
              if (typeof v === 'function') {
                return `  ${JSON.stringify(k)}: () => {}`;
              }
              return `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`;
            })
            .join(',\n')}\n}`;

    const jsxProps =
      propsEntries.length === 0
        ? ''
        : '\n' +
          propsEntries
            .map(([k, v]) => {
              if (typeof v === 'string') {
                return `      ${k}=${JSON.stringify(v)}`;
              }
              if (typeof v === 'function') {
                return `      ${k}={() => {}}`;
              }
              return `      ${k}={${JSON.stringify(v)}}`;
            })
            .join('\n') +
          '\n    ';

    return `import React from 'react';
${importStatement}

export const mockProps = ${mockPropsFormatted};

export default function Preview() {
  return (
    <${safeName}${jsxProps}/>
  );
}
`;
  }

  private inspectDeclaration(
    decl: Node,
    exportName: string,
    filePath: string,
    _sourceFile: SourceFile
  ): { node: Node; name: string; exportType: 'named' | 'default'; varDecl?: VariableDeclaration } | null {
    const isDefault = exportName === 'default';

    if (Node.isFunctionDeclaration(decl)) {
      if (hasJsx(decl)) {
        const rawName = decl.getName();
        const name = (isDefault ? rawName : exportName) || inferNameFromFile(filePath);
        return { node: decl, name, exportType: isDefault ? 'default' : 'named' };
      }
    } else if (Node.isClassDeclaration(decl)) {
      if (hasJsx(decl)) {
        const rawName = decl.getName();
        const name = (isDefault ? rawName : exportName) || inferNameFromFile(filePath);
        return { node: decl, name, exportType: isDefault ? 'default' : 'named' };
      }
    } else if (Node.isVariableDeclaration(decl)) {
      const init = decl.getInitializer();
      if (init) {
        if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) {
          if (hasJsx(init)) {
            const rawName = decl.getName();
            const name = (isDefault ? rawName : exportName) || inferNameFromFile(filePath);
            return { node: init, name, exportType: isDefault ? 'default' : 'named', varDecl: decl };
          }
        } else if (Node.isCallExpression(init)) {
          // React.memo or forwardRef
          if (hasJsx(init)) {
            const rawName = decl.getName();
            const name = (isDefault ? rawName : exportName) || inferNameFromFile(filePath);
            return { node: init, name, exportType: isDefault ? 'default' : 'named', varDecl: decl };
          }
        }
      }
    } else if (Node.isArrowFunction(decl) || Node.isFunctionExpression(decl)) {
      if (hasJsx(decl)) {
        const name = inferNameFromFile(filePath);
        return { node: decl, name, exportType: isDefault ? 'default' : 'named' };
      }
    }

    return null;
  }

  private extractProps(
    node: Node,
    _sourceFile: SourceFile,
    varDecl?: VariableDeclaration
  ): ComponentProp[] {
    const props: ComponentProp[] = [];
    const defaultValues: Record<string, string> = {};

    let targetParam: Node | undefined;
    let typeNodeOverride: Node | undefined;

    if (
      Node.isFunctionDeclaration(node) ||
      Node.isArrowFunction(node) ||
      Node.isFunctionExpression(node)
    ) {
      targetParam = node.getParameters()[0];
    } else if (Node.isCallExpression(node)) {
      const args = node.getArguments();
      const fnArg = args[0];
      if (fnArg && (Node.isArrowFunction(fnArg) || Node.isFunctionExpression(fnArg))) {
        targetParam = fnArg.getParameters()[0];
      }
      const typeArgs = node.getTypeArguments();
      if (typeArgs.length > 0) {
        // e.g. forwardRef<Ref, Props> (Props is usually 2nd arg) or memo<Props>
        typeNodeOverride = typeArgs.length >= 2 ? typeArgs[1] : typeArgs[0];
      }
    }

    // Check destructured default values
    if (targetParam && Node.isParameterDeclaration(targetParam)) {
      const nameNode = targetParam.getNameNode();
      if (Node.isObjectBindingPattern(nameNode)) {
        for (const element of nameNode.getElements()) {
          const propName = element.getName();
          const init = element.getInitializer();
          if (init) {
            defaultValues[propName] = init.getText();
          }
        }
      }
    }

    // Check React.FC<Props> on variable declaration
    if (varDecl && !typeNodeOverride) {
      const typeNode = varDecl.getTypeNode();
      if (typeNode && Node.isTypeReference(typeNode)) {
        const typeArgs = typeNode.getTypeArguments();
        if (typeArgs.length > 0) {
          typeNodeOverride = typeArgs[0];
        }
      }
    }

    // Check ClassComponent heritage
    if (Node.isClassDeclaration(node) && !typeNodeOverride) {
      const heritageClauses = node.getHeritageClauses();
      for (const clause of heritageClauses) {
        for (const typeNode of clause.getTypeNodes()) {
          const typeArgs = typeNode.getTypeArguments();
          if (typeArgs.length > 0) {
            typeNodeOverride = typeArgs[0];
            break;
          }
        }
      }
    }

    // Case 1: typeNodeOverride exists (React.FC<Props>, Component<Props>, forwardRef<..., Props>)
    if (typeNodeOverride) {
      const type = typeNodeOverride.getType();
      for (const propSym of type.getProperties()) {
        const propName = propSym.getName();
        if (['key', 'ref', 'children'].includes(propName) && propSym.isOptional()) {
          // Keep explicit props
        }
        if (['key', 'ref'].includes(propName)) continue;

        const valDecl = propSym.getValueDeclaration() || propSym.getDeclarations()[0];
        let typeText = valDecl?.getType().getText() || propSym.getTypeAtLocation(typeNodeOverride).getText();
        typeText = cleanTypeText(typeText);

        const isOpt =
          propSym.isOptional() ||
          (valDecl && Node.isPropertySignature(valDecl) && valDecl.hasQuestionToken()) ||
          defaultValues[propName] !== undefined;

        let description: string | undefined;
        if (valDecl && (Node.isPropertySignature(valDecl) || Node.isPropertyDeclaration(valDecl))) {
          const docs = valDecl.getJsDocs().map((d) => d.getCommentText()).join('\n').trim();
          if (docs) description = docs;
        }

        props.push({
          name: propName,
          type: typeText,
          required: !isOpt,
          defaultValue: defaultValues[propName],
          description,
        });
      }
      return props;
    }

    // Case 2: Function/arrow param with typed parameter
    if (targetParam && Node.isParameterDeclaration(targetParam)) {
      const paramType = targetParam.getType();
      if (paramType && paramType.getProperties().length > 0 && paramType.getText() !== 'any') {
        for (const propSym of paramType.getProperties()) {
          const propName = propSym.getName();
          if (['key', 'ref'].includes(propName)) continue;

          const propTypeAtLoc = propSym.getTypeAtLocation(targetParam);
          let typeText = cleanTypeText(propTypeAtLoc.getText(targetParam));

          const isOpt =
            propSym.isOptional() ||
            (propTypeAtLoc.isUnion() && propTypeAtLoc.getUnionTypes().some((t) => t.isUndefined())) ||
            defaultValues[propName] !== undefined;

          let description: string | undefined;
          const decl = propSym.getValueDeclaration() || propSym.getDeclarations()[0];
          if (decl && (Node.isPropertySignature(decl) || Node.isPropertyDeclaration(decl))) {
            const docs = decl.getJsDocs().map((d) => d.getCommentText()).join('\n').trim();
            if (docs) description = docs;
          }

          props.push({
            name: propName,
            type: typeText,
            required: !isOpt,
            defaultValue: defaultValues[propName],
            description,
          });
        }
        return props;
      }

      // Case 3: Untyped parameter with object destructuring ({ title, count = 10 })
      const bindingPattern = targetParam.getNameNode();
      if (Node.isObjectBindingPattern(bindingPattern)) {
        for (const element of bindingPattern.getElements()) {
          const propName = element.getName();
          const init = element.getInitializer();
          const defaultValue = init?.getText();
          let inferredType = 'any';
          if (init) {
            if (Node.isStringLiteral(init)) inferredType = 'string';
            else if (Node.isNumericLiteral(init)) inferredType = 'number';
            else if (init.getText() === 'true' || init.getText() === 'false') inferredType = 'boolean';
          }
          props.push({
            name: propName,
            type: inferredType,
            required: defaultValue === undefined,
            defaultValue,
          });
        }
      }
    }

    return props;
  }

  private synthesizeSingleProp(propName: string, typeStr: string): unknown {
    const normalized = propName.toLowerCase().replace(/[-_]/g, '');

    // Fixture heuristics matching spec:
    // title, label, name -> "Sample Item"
    if (
      ['title', 'label', 'name'].includes(normalized) ||
      normalized.endsWith('title') ||
      normalized.endsWith('label') ||
      normalized.endsWith('name')
    ) {
      return 'Sample Item';
    }

    // description, content -> "Sample descriptive text for preview."
    if (
      ['description', 'content'].includes(normalized) ||
      normalized.endsWith('description') ||
      normalized.endsWith('content')
    ) {
      return 'Sample descriptive text for preview.';
    }

    // count, price, amount -> 42
    if (
      ['count', 'price', 'amount'].includes(normalized) ||
      normalized.endsWith('count') ||
      normalized.endsWith('price') ||
      normalized.endsWith('amount')
    ) {
      return 42;
    }

    // isActive, isOpen, enabled -> true
    if (
      ['isactive', 'isopen', 'enabled'].includes(normalized) ||
      normalized === 'active' ||
      normalized === 'open'
    ) {
      return true;
    }

    // avatarUrl, imageUrl, src -> "https://images.unsplash.com/photo-1534528741775-53994a69daeb"
    if (
      ['avatarurl', 'imageurl', 'src'].includes(normalized) ||
      normalized.endsWith('avatarurl') ||
      normalized.endsWith('imageurl') ||
      normalized === 'src' ||
      normalized === 'avatar' ||
      normalized === 'image'
    ) {
      return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb';
    }

    // onClick, onChange, onSubmit -> [Function]
    if (
      ['onclick', 'onchange', 'onsubmit'].includes(normalized) ||
      normalized.startsWith('on') ||
      normalized.startsWith('handle')
    ) {
      return createMockFunction(propName);
    }

    // Fallbacks by type
    const cleanType = (typeStr || '').trim();

    // Union of string literals like 'sm' | 'md' | 'lg'
    const unionMatch = cleanType.match(/^(?:'([^']+)'|"([^"]+)")/);
    if (unionMatch) {
      return unionMatch[1] || unionMatch[2];
    }

    if (cleanType.includes('=>') || cleanType.toLowerCase().includes('function')) {
      return createMockFunction(propName);
    }

    if (cleanType.includes('boolean')) {
      return true;
    }

    if (cleanType.includes('number')) {
      return 42;
    }

    if (cleanType.includes('string[]') || cleanType.includes('Array<string>')) {
      return ['Sample Item'];
    }

    if (cleanType.includes('[]') || cleanType.includes('Array<')) {
      return [];
    }

    if (/ReactNode|ReactElement|JSX\.Element/.test(cleanType) || propName === 'children') {
      return 'Sample Content';
    }

    if (cleanType.includes('string')) {
      return 'Sample text';
    }

    if (cleanType.includes('{') || cleanType.includes('Record<') || cleanType.includes('object')) {
      return {};
    }

    return null;
  }
}
