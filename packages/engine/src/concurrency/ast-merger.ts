import * as ts from 'typescript';

export class MergeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeConflictError';
  }
}

export function mergeFiles(sourceA: string, sourceB: string, fileName: string = 'file.ts'): string {
  const sourceFileA = ts.createSourceFile(fileName, sourceA, ts.ScriptTarget.Latest, true);
  const sourceFileB = ts.createSourceFile(fileName, sourceB, ts.ScriptTarget.Latest, true);

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

  const statementsA = new Map<string, ts.Statement[]>();
  const statementsB = new Map<string, ts.Statement[]>();
  
  const getStmtName = (stmt: ts.Statement, sf: ts.SourceFile): string => {
    if (ts.isClassDeclaration(stmt) && stmt.name) return `class:${stmt.name.text}`;
    if (ts.isInterfaceDeclaration(stmt) && stmt.name) return `interface:${stmt.name.text}`;
    if (ts.isFunctionDeclaration(stmt) && stmt.name) return `function:${stmt.name.text}`;
    if (ts.isTypeAliasDeclaration(stmt)) return `type:${stmt.name.text}`;
    if (ts.isEnumDeclaration(stmt)) return `enum:${stmt.name.text}`;
    if (ts.isModuleDeclaration(stmt)) return `module:${stmt.name.text}`;
    if (ts.isVariableStatement(stmt)) {
      const decls = stmt.declarationList.declarations;
      if (decls.length === 1 && ts.isIdentifier(decls[0].name)) {
        return `var:${decls[0].name.text}`;
      }
    }
    return stmt.getText(sf).trim(); 
  };

  const keysA: string[] = [];
  const keysB: string[] = [];

  sourceFileA.statements.forEach(stmt => {
    const name = getStmtName(stmt, sourceFileA);
    if (!statementsA.has(name)) {
      statementsA.set(name, []);
      keysA.push(name);
    }
    statementsA.get(name)!.push(stmt);
  });

  sourceFileB.statements.forEach(stmt => {
    const name = getStmtName(stmt, sourceFileB);
    if (!statementsB.has(name)) {
      statementsB.set(name, []);
      keysB.push(name);
    }
    statementsB.get(name)!.push(stmt);
  });

  const mergeMembers = <T extends ts.Node>(
    membersA: ts.NodeArray<T>,
    membersB: ts.NodeArray<T>,
    srcA: ts.SourceFile,
    srcB: ts.SourceFile
  ): T[] => {
    const getMemberName = (m: ts.Node, src: ts.SourceFile): string => {
      let isStatic = false;
      const modifiers = (m as any).modifiers;
      if (modifiers && Array.isArray(modifiers)) {
        isStatic = modifiers.some((mod: any) => mod.kind === ts.SyntaxKind.StaticKeyword);
      }
      const staticPrefix = isStatic ? 'static:' : '';
      if (ts.isConstructorDeclaration(m)) {
        return `constructor`;
      }
      if (ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m) || ts.isMethodSignature(m) || ts.isPropertySignature(m) || ts.isGetAccessor(m) || ts.isSetAccessor(m)) {
        const nameNode = (m as any).name;
        if (nameNode) {
          const kind = ts.isGetAccessor(m) ? 'get:' : ts.isSetAccessor(m) ? 'set:' : '';
          return `${staticPrefix}${kind}${nameNode.getText(src)}`;
        }
      }
      return m.getText(src).trim();
    };

    const mapA = new Map<string, T[]>();
    const mapB = new Map<string, T[]>();
    const mKeysA: string[] = [];
    const mKeysB: string[] = [];

    membersA.forEach(m => {
      const name = getMemberName(m, srcA);
      if (!mapA.has(name)) {
        mapA.set(name, []);
        mKeysA.push(name);
      }
      mapA.get(name)!.push(m);
    });

    membersB.forEach(m => {
      const name = getMemberName(m, srcB);
      if (!mapB.has(name)) {
        mapB.set(name, []);
        mKeysB.push(name);
      }
      mapB.get(name)!.push(m);
    });

    const mergedM: T[] = [];
    const mProcessed = new Set<string>();

    const allKeys = Array.from(new Set([...mKeysA, ...mKeysB]));
    for (const key of allKeys) {
      if (mProcessed.has(key)) continue;
      mProcessed.add(key);

      const msA = mapA.get(key) || [];
      const msB = mapB.get(key) || [];

      if (msA.length > 0 && msB.length === 0) {
        mergedM.push(...msA);
      } else if (msA.length === 0 && msB.length > 0) {
        mergedM.push(...msB);
      } else if (msA.length > 0 && msB.length > 0) {
        const textsA = msA.map(m => m.getText(srcA)).join('\n');
        const textsB = msB.map(m => m.getText(srcB)).join('\n');
        if (textsA === textsB) {
          mergedM.push(...msA);
        } else {
          throw new MergeConflictError(`Conflict in member: ${key}`);
        }
      }
    }
    return mergedM;
  };

  const outputNodes: ts.Node[] = [];
  const processed = new Set<string>();
  const allKeys = Array.from(new Set([...keysA, ...keysB]));
  
  for (const key of allKeys) {
    if (processed.has(key)) continue;
    processed.add(key);

    const stmtsA = statementsA.get(key) || [];
    const stmtsB = statementsB.get(key) || [];

    if (stmtsA.length > 0 && stmtsB.length === 0) {
      outputNodes.push(...stmtsA);
    } else if (stmtsA.length === 0 && stmtsB.length > 0) {
      outputNodes.push(...stmtsB);
    } else if (stmtsA.length > 0 && stmtsB.length > 0) {
      const textsA = stmtsA.map(s => s.getText(sourceFileA)).join('\n');
      const textsB = stmtsB.map(s => s.getText(sourceFileB)).join('\n');
      
      if (textsA === textsB) {
        outputNodes.push(...stmtsA);
      } else if (stmtsA.length === 1 && stmtsB.length === 1 && ts.isClassDeclaration(stmtsA[0]) && ts.isClassDeclaration(stmtsB[0])) {
        const classA = stmtsA[0];
        const classB = stmtsB[0];
        
        // Ensure modifiers, typeParameters, heritageClauses match or handle conflicts
        const modA = classA.modifiers?.map(m => m.getText(sourceFileA)).join(' ') || '';
        const modB = classB.modifiers?.map(m => m.getText(sourceFileB)).join(' ') || '';
        if (modA !== modB) throw new MergeConflictError(`Conflict in modifiers for class: ${key}`);

        const tpA = classA.typeParameters?.map(m => m.getText(sourceFileA)).join(' ') || '';
        const tpB = classB.typeParameters?.map(m => m.getText(sourceFileB)).join(' ') || '';
        if (tpA !== tpB) throw new MergeConflictError(`Conflict in type parameters for class: ${key}`);

        const hcA = classA.heritageClauses?.map(m => m.getText(sourceFileA)).join(' ') || '';
        const hcB = classB.heritageClauses?.map(m => m.getText(sourceFileB)).join(' ') || '';
        if (hcA !== hcB) throw new MergeConflictError(`Conflict in heritage clauses for class: ${key}`);

        const mergedMembers = mergeMembers(classA.members, classB.members, sourceFileA, sourceFileB);
        
        const newClass = ts.factory.updateClassDeclaration(
          classA,
          classA.modifiers,
          classA.name,
          classA.typeParameters,
          classA.heritageClauses,
          [] as ts.ClassElement[]
        );
        const headerAndFooter = printer.printNode(ts.EmitHint.Unspecified, newClass, sourceFileA);
        const braceIdx = headerAndFooter.indexOf('{');
        const header = headerAndFooter.substring(0, braceIdx + 1);
        const footer = headerAndFooter.substring(braceIdx + 1);
        const body = mergedMembers.map(m => {
          // Find original source file for member
          return m.getText(m.parent === classA ? sourceFileA : sourceFileB);
        }).join('\n  ');
        
        outputNodes.push({ __syntheticText: `${header}\n  ${body}${footer}` } as any);
      } else if (stmtsA.length === 1 && stmtsB.length === 1 && ts.isInterfaceDeclaration(stmtsA[0]) && ts.isInterfaceDeclaration(stmtsB[0])) {
        const intA = stmtsA[0];
        const intB = stmtsB[0];

        const modA = intA.modifiers?.map(m => m.getText(sourceFileA)).join(' ') || '';
        const modB = intB.modifiers?.map(m => m.getText(sourceFileB)).join(' ') || '';
        if (modA !== modB) throw new MergeConflictError(`Conflict in modifiers for interface: ${key}`);

        const tpA = intA.typeParameters?.map(m => m.getText(sourceFileA)).join(' ') || '';
        const tpB = intB.typeParameters?.map(m => m.getText(sourceFileB)).join(' ') || '';
        if (tpA !== tpB) throw new MergeConflictError(`Conflict in type parameters for interface: ${key}`);

        const hcA = intA.heritageClauses?.map(m => m.getText(sourceFileA)).join(' ') || '';
        const hcB = intB.heritageClauses?.map(m => m.getText(sourceFileB)).join(' ') || '';
        if (hcA !== hcB) throw new MergeConflictError(`Conflict in heritage clauses for interface: ${key}`);

        const mergedMembers = mergeMembers(intA.members, intB.members, sourceFileA, sourceFileB);

        const newInt = ts.factory.updateInterfaceDeclaration(
          intA,
          intA.modifiers,
          intA.name,
          intA.typeParameters,
          intA.heritageClauses,
          [] as ts.TypeElement[]
        );
        
        const headerAndFooter = printer.printNode(ts.EmitHint.Unspecified, newInt, sourceFileA);
        const braceIdx = headerAndFooter.indexOf('{');
        const header = headerAndFooter.substring(0, braceIdx + 1);
        const footer = headerAndFooter.substring(braceIdx + 1);
        const body = mergedMembers.map(m => {
          return m.getText(m.parent === intA ? sourceFileA : sourceFileB);
        }).join('\n  ');
        
        outputNodes.push({ __syntheticText: `${header}\n  ${body}${footer}` } as any);
      } else {
        throw new MergeConflictError(`Conflict in statement: ${key}`);
      }
    }
  }

  const outputStrings = outputNodes.map(node => {
    if ((node as any).__syntheticText) {
      return (node as any).__syntheticText;
    } else {
      let src = sourceFileA;
      if (keysB.includes(getStmtName(node as ts.Statement, sourceFileB)) && !keysA.includes(getStmtName(node as ts.Statement, sourceFileB))) {
        src = sourceFileB;
      }
      return printer.printNode(ts.EmitHint.Unspecified, node, src);
    }
  });

  return outputStrings.join('\n\n') + '\n';
}
