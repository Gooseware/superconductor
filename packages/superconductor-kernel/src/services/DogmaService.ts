import { Project, SyntaxKind, Node } from 'ts-morph';
import { getSkeletonTemplate } from '../templates/skeleton-primitives.js';

export class DogmaService {
  private project: Project;

  constructor() {
    this.project = new Project();
  }

  async validate(filePath: string): Promise<{ success: boolean; errors: string[]; suggestions?: string[] }> {
    const sourceFile = this.project.getSourceFile(filePath) || this.project.addSourceFileAtPath(filePath);
    
    if (!sourceFile) {
        return { success: false, errors: ["Could not read source file."] };
    }

    const errors: string[] = [];
    const suggestions: string[] = [];

    // 1. Basic Content Checks (Legacy)
    const text = sourceFile.getFullText();
    const hexRegex = /#([0-9A-F]{3}){1,2}/gi;
    const matches = text.match(hexRegex);
    if (matches && matches.length > 0) {
      errors.push(`Found hardcoded hex colors: ${matches.join(', ')}. Use CSS variables (var(--color-*)) or Tailwind theme tokens.`);
    }

    sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).forEach(attr => {
      if (attr.getNameNode().getText() === 'style') {
        errors.push("Avoid using inline 'style' props. Use Tailwind classes instead.");
      }
    });

    const hasExport = sourceFile.getExportedDeclarations().size > 0;
    if (!hasExport) {
      errors.push("No exported declarations found. Components must be exported.");
    }

    // 2. Lifecycle & Memory Management
    this.checkLifecycle(sourceFile, errors);

    // 3. SSR Safety
    this.checkSSRSafety(sourceFile, errors);

    // 4. Visual Stability
    this.checkVisualStability(sourceFile, errors, suggestions);

    // 5. Accessibility
    this.checkA11y(sourceFile, errors);

    this.project.removeSourceFile(sourceFile);

    return {
      success: errors.length === 0,
      errors,
      suggestions
    };
  }

  private checkLifecycle(sourceFile: any, errors: string[]) {
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call: any) => {
      const expression = call.getExpression();
      const name = expression.getText();
      
      if (name === 'useEffect' || name === 'React.useEffect') {
        const args = call.getArguments();
        if (args.length > 0) {
          const effectFn = args[0];
          if (Node.isFunctionLikeDeclaration(effectFn) || Node.isArrowFunction(effectFn)) {
            const body = effectFn.getBody();
            const bodyText = body.getText();
            
            const needsCleanup = 
              bodyText.includes('.addEventListener') || 
              bodyText.includes('setInterval') || 
              bodyText.includes('setTimeout') ||
              bodyText.includes('new IntersectionObserver') ||
              bodyText.includes('new ResizeObserver');

            if (needsCleanup) {
              const hasReturn = body.getDescendantsOfKind(SyntaxKind.ReturnStatement).length > 0;

              if (!hasReturn) {
                errors.push(`Missing cleanup function in useEffect at line ${call.getStartLineNumber()}. Listeners or timers detected.`);
              }
            }
          }
        }
      }
    });
  }

  private checkSSRSafety(sourceFile: any, errors: string[]) {
    sourceFile.getDescendantsOfKind(SyntaxKind.Identifier).forEach((id: any) => {
      const name = id.getText();
      if (name === 'window' || name === 'document') {
        const parent = id.getParent();
        if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) return;

        let current: Node = id;
        let insideSafeZone = false;
        while (current) {
          if (Node.isCallExpression(current)) {
            const callName = current.getExpression().getText();
            if (callName === 'useEffect' || callName === 'React.useEffect') {
              insideSafeZone = true;
              break;
            }
          }
          
          const fullText = current.getText();
          if (fullText.includes("typeof window !== 'undefined'") || 
              fullText.includes('typeof window !== "undefined"') ||
              fullText.includes("typeof window === 'object'")) {
            insideSafeZone = true;
            break;
          }

          current = current.getParent() as Node;
        }

        if (!insideSafeZone) {
          errors.push(`Direct access to window/document detected outside of safe boundaries (useEffect or typeof check) at line ${id.getStartLineNumber()}. This may cause Hydration Mismatches.`);
        }
      }
    });
  }

  private checkVisualStability(sourceFile: any, errors: string[], suggestions: string[]) {
    sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).forEach((node: any) => {
      const tagName = node.getTagNameNode().getText();
      if (tagName === 'img' || tagName === 'video' || tagName === 'Image') {
        const attrs = node.getAttributes();
        const hasWidth = attrs.some((a: any) => a.getNameNode().getText() === 'width');
        const hasHeight = attrs.some((a: any) => a.getNameNode().getText() === 'height');
        const hasAspectRatio = attrs.some((a: any) => a.getNameNode().getText() === 'className' && a.getInitializer()?.getText().includes('aspect-'));

        if (!hasWidth && !hasHeight && !hasAspectRatio) {
          errors.push(`Missing explicit dimensions or aspect-ratio for <${tagName} /> at line ${node.getStartLineNumber()}. This may cause Cumulative Layout Shift (CLS).`);
        }
      }
    });

    const hasSkeleton = sourceFile.getExportedDeclarations().has('Skeleton');
    if (!hasSkeleton) {
      const isComplex = sourceFile.getFullText().includes('.map(') || sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement).length > 10;
      if (isComplex) {
        suggestions.push(`Component is complex but missing a Skeleton export. Use 'registry_fix_dogma' to auto-generate one.`);
      }
    }
  }

  private checkA11y(sourceFile: any, errors: string[]) {
    sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement).forEach((node: any) => {
      const attrs = node.getAttributes();
      const hasOnClick = attrs.some((a: any) => a.getNameNode().getText() === 'onClick');
      if (hasOnClick) {
        const tagName = node.getTagNameNode().getText();
        const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
        if (!interactiveTags.includes(tagName)) {
          const hasKeyDown = attrs.some((a: any) => a.getNameNode().getText() === 'onKeyDown');
          const hasTabIndex = attrs.some((a: any) => a.getNameNode().getText() === 'tabIndex');
          if (!hasKeyDown || !hasTabIndex) {
            errors.push(`Non-interactive tag <${tagName}> at line ${node.getStartLineNumber()} has onClick but missing onKeyDown or tabIndex. This breaks keyboard accessibility.`);
          }
        }
      }
    });
  }

  async generateSkeleton(filePath: string): Promise<string> {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);
    
    const firstDiv = sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement).find(e => e.getTagNameNode().getText() === 'div');
    let dimensions = "h-40 w-full";
    if (firstDiv) {
      const classNameAttr = firstDiv.getAttribute('className');
      if (classNameAttr && Node.isJsxAttribute(classNameAttr)) {
        const text = classNameAttr.getInitializer()?.getText() || "";
        const matches = text.match(/\b(h|w)-\[?[a-z0-9/.]+\]?\b/g);
        if (matches) dimensions = matches.join(" ");
      }
    }

    return getSkeletonTemplate('shimmer', dimensions);
  }

  async fix(filePath: string): Promise<{ success: boolean; fixes: string[] }> {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);
    const fixes: string[] = [];

    const text = sourceFile.getFullText();
    const hexRegex = /#([0-9A-F]{3,8})\b/gi;
    
    const colorMap: Record<string, string> = {
      '#ffffff': 'var(--background)',
      '#000000': 'var(--foreground)',
      '#007bff': 'var(--primary)',
      '#6c757d': 'var(--secondary)',
      '#28a745': 'var(--success)',
      '#dc3545': 'var(--destructive)',
      '#ffc107': 'var(--warning)',
      '#17a2b8': 'var(--info)',
    };

    let modifiedText = text;
    const matches = text.match(hexRegex);
    if (matches) {
      for (const hex of [...new Set(matches)]) {
        const lowerHex = hex.toLowerCase();
        const replacement = colorMap[lowerHex] || `var(--color-custom-${lowerHex.slice(1)})`;
        const regex = new RegExp(hex, 'g');
        modifiedText = modifiedText.replace(regex, replacement);
        fixes.push(`Replaced ${hex} with ${replacement}`);
      }
    }

    // Auto-Skeleton check
    if (!sourceFile.getExportedDeclarations().has('Skeleton')) {
      const skeleton = await this.generateSkeleton(filePath);
      modifiedText += "\n" + skeleton;
      fixes.push("Added auto-generated Skeleton component.");
    }

    if (fixes.length > 0) {
      sourceFile.replaceWithText(modifiedText);
      await sourceFile.save();
    }

    return {
      success: true,
      fixes
    };
  }
}
