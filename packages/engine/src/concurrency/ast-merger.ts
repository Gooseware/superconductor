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

  const statementsA = new Map<string, ts.Statement>();
  const statementsB = new Map<string, ts.Statement>();
  
  const getStmtName = (stmt: ts.Statement, sf: ts.SourceFile): string | null => {
    if (ts.isClassDeclaration(stmt) && stmt.name) return `class:${stmt.name.text}`;
    if (ts.isInterfaceDeclaration(stmt) && stmt.name) return `interface:${stmt.name.text}`;
    if (ts.isFunctionDeclaration(stmt) && stmt.name) return `function:${stmt.name.text}`;
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
    if (name) {
      statementsA.set(name, stmt);
      keysA.push(name);
    }
  });

  sourceFileB.statements.forEach(stmt => {
    const name = getStmtName(stmt, sourceFileB);
    if (name) {
      statementsB.set(name, stmt);
      keysB.push(name);
    }
  });

  const mergeMembers = <T extends ts.Node>(
    membersA: ts.NodeArray<T>,
    membersB: ts.NodeArray<T>,
    srcA: ts.SourceFile,
    srcB: ts.SourceFile
  ): string[] => {
    const getMemberName = (m: ts.Node, src: ts.SourceFile): string => {
      if ((ts.isMethodDeclaration(m) || ts.isPropertyDeclaration(m) || ts.isMethodSignature(m) || ts.isPropertySignature(m)) && m.name) {
        return m.name.getText(src);
      }
      return m.getText(src).trim();
    };

    const mapA = new Map<string, T>();
    const mapB = new Map<string, T>();
    const mKeysA: string[] = [];
    const mKeysB: string[] = [];

    membersA.forEach(m => {
      const name = getMemberName(m, srcA);
      mapA.set(name, m);
      mKeysA.push(name);
    });

    membersB.forEach(m => {
      const name = getMemberName(m, srcB);
      mapB.set(name, m);
      mKeysB.push(name);
    });

    const mergedM: string[] = [];
    const mProcessed = new Set<string>();

    const allKeys = Array.from(new Set([...mKeysA, ...mKeysB]));
    for (const key of allKeys) {
      if (mProcessed.has(key)) continue;
      mProcessed.add(key);

      const mA = mapA.get(key);
      const mB = mapB.get(key);

      if (mA && !mB) {
        mergedM.push(printer.printNode(ts.EmitHint.Unspecified, mA, srcA));
      } else if (!mA && mB) {
        mergedM.push(printer.printNode(ts.EmitHint.Unspecified, mB, srcB));
      } else if (mA && mB) {
        const textA = mA.getText(srcA);
        const textB = mB.getText(srcB);
        if (textA === textB) {
          mergedM.push(printer.printNode(ts.EmitHint.Unspecified, mA, srcA));
        } else {
          throw new MergeConflictError(`Conflict in member: ${key}`);
        }
      }
    }
    return mergedM;
  };

  const output: string[] = [];
  const processed = new Set<string>();
  const allKeys = Array.from(new Set([...keysA, ...keysB]));
  
  for (const key of allKeys) {
    if (processed.has(key)) continue;
    processed.add(key);

    const stmtA = statementsA.get(key);
    const stmtB = statementsB.get(key);

    if (stmtA && !stmtB) {
      output.push(printer.printNode(ts.EmitHint.Unspecified, stmtA, sourceFileA));
    } else if (!stmtA && stmtB) {
      output.push(printer.printNode(ts.EmitHint.Unspecified, stmtB, sourceFileB));
    } else if (stmtA && stmtB) {
      const textA = stmtA.getText(sourceFileA);
      const textB = stmtB.getText(sourceFileB);
      
      if (textA === textB) {
        output.push(printer.printNode(ts.EmitHint.Unspecified, stmtA, sourceFileA));
      } else if (ts.isClassDeclaration(stmtA) && ts.isClassDeclaration(stmtB)) {
        const mergedMembers = mergeMembers(stmtA.members, stmtB.members, sourceFileA, sourceFileB);
        
        let classModifiers = '';
        if (stmtA.modifiers) {
           classModifiers = stmtA.modifiers.map(m => m.getText(sourceFileA)).join(' ') + ' ';
        }
        
        let heritage = '';
        if (stmtA.heritageClauses) {
           heritage = ' ' + stmtA.heritageClauses.map(h => h.getText(sourceFileA)).join(' ');
        }
        
        const className = stmtA.name ? stmtA.name.text : 'default';
        const classOutput = `${classModifiers}class ${className}${heritage} {\n  ${mergedMembers.join('\n  ')}\n}`;
        output.push(classOutput);
      } else if (ts.isInterfaceDeclaration(stmtA) && ts.isInterfaceDeclaration(stmtB)) {
        const mergedMembers = mergeMembers(stmtA.members, stmtB.members, sourceFileA, sourceFileB);
        
        let modifiers = '';
        if (stmtA.modifiers) {
           modifiers = stmtA.modifiers.map(m => m.getText(sourceFileA)).join(' ') + ' ';
        }
        
        let heritage = '';
        if (stmtA.heritageClauses) {
           heritage = ' ' + stmtA.heritageClauses.map(h => h.getText(sourceFileA)).join(' ');
        }
        
        const name = stmtA.name.text;
        const out = `${modifiers}interface ${name}${heritage} {\n  ${mergedMembers.join('\n  ')}\n}`;
        output.push(out);
      } else {
        throw new MergeConflictError(`Conflict in statement: ${key}`);
      }
    }
  }

  return output.join('\n\n') + '\n';
}
