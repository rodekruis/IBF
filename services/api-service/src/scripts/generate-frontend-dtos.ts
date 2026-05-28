import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as ts from 'typescript';

// Add DTO source files here to share them with the Go frontend repo.
// Also add any DTOs they import, and add any enums they use to shared-enums.
const SOURCE_DTOS = [
  'services/api-service/src/events/dto/event-exposed-admin-area.dto.ts',
  'services/api-service/src/events/dto/event-response.dto.ts',
];

const SHARED_ENUMS_SOURCE_REL = 'services/api-service/src/shared-enums.ts';
const SHARED_ENUMS_MODULE_SPECIFIER = '@api-service/src/shared-enums';
const SHARED_ENUMS_OUTPUT_IMPORT = './shared-enums';

const REPO_ROOT = resolve(__dirname, '../../../..');

const goRepoLocalPath = process.env.GO_REPO_LOCAL_PATH;
if (!goRepoLocalPath) {
  throw new Error(
    'GO_REPO_LOCAL_PATH is not set. Set it in services/.env to point at the local clone of the Go frontend repo.',
  );
}

const OUTPUT_DIR = resolve(REPO_ROOT, goRepoLocalPath, 'app/src/utils/nrw');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'shared-dtos.ts');
const SHARED_ENUMS_OUTPUT = resolve(OUTPUT_DIR, 'shared-enums.ts');

const HEADER = `/**
 * AUTO-GENERATED from api-service DTOs. Do not edit by hand.
 * Regenerate with \`npm run gen:frontend\` (from the IBF repo root).
 *
 * Source DTOs:
${SOURCE_DTOS.map((source) => ` * - ${source}`).join('\n')}
 */

`;

// Converts each top-level class declaration in the source file into an
// equivalent interface declaration, dropping decorators, method members,
// and property initializers (none of which are valid on an interface).
const convertClassesToInterfaces = (
  sourceFile: ts.SourceFile,
): ts.SourceFile => {
  const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const { factory } = context;
    const visit: ts.Visitor = (node) => {
      if (ts.isClassDeclaration(node) && node.name) {
        const exportModifier = node.modifiers?.find(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) as ts.Modifier | undefined;
        const interfaceModifiers = exportModifier
          ? [exportModifier]
          : undefined;

        const propertySignatures: ts.PropertySignature[] = [];
        for (const member of node.members) {
          if (!ts.isPropertyDeclaration(member)) continue;
          propertySignatures.push(
            factory.createPropertySignature(
              undefined,
              member.name,
              member.questionToken,
              member.type,
            ),
          );
        }

        return factory.createInterfaceDeclaration(
          interfaceModifiers,
          node.name,
          node.typeParameters,
          node.heritageClauses,
          propertySignatures,
        );
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (file) => ts.visitNode(file, visit) as ts.SourceFile;
  };

  return ts.transform(sourceFile, [transformer]).transformed[0];
};

// Extracts names imported from the shared-enums module in the source file.
const collectSharedEnumImports = (sourceFile: ts.SourceFile): string[] => {
  const names: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleSpecifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(moduleSpecifier)) continue;
    if (moduleSpecifier.text !== SHARED_ENUMS_MODULE_SPECIFIER) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        names.push(element.name.text);
      }
    }
  }
  return names;
};

// Prints every top-level interface declaration (drops imports and other statements).
const printInterfaces = (sourceFile: ts.SourceFile): string => {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const chunks: string[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      chunks.push(
        printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile),
      );
    }
  }
  return chunks.join('\n\n');
};

const generate = (): void => {
  const sharedEnumImports = new Set<string>();
  const interfaceBlocks: string[] = [];

  for (const relativePath of SOURCE_DTOS) {
    const absolutePath = resolve(REPO_ROOT, relativePath);
    const program = ts.createProgram([absolutePath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      experimentalDecorators: true,
      noResolve: true,
    });
    const sourceFile = program.getSourceFile(absolutePath);
    if (!sourceFile) {
      throw new Error(`Could not load source file: ${absolutePath}`);
    }

    for (const name of collectSharedEnumImports(sourceFile)) {
      sharedEnumImports.add(name);
    }

    const converted = convertClassesToInterfaces(sourceFile);
    const printed = printInterfaces(converted);
    if (printed.trim().length > 0) {
      interfaceBlocks.push(printed);
    }
  }

  const importLine =
    sharedEnumImports.size > 0
      ? `import type { ${[...sharedEnumImports].sort().join(', ')} } from '${SHARED_ENUMS_OUTPUT_IMPORT}';\n\n`
      : '';

  const fileContents =
    HEADER + importLine + interfaceBlocks.join('\n\n') + '\n';

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, fileContents);
  console.log(`Wrote ${OUTPUT_FILE}`);

  copyFileSync(
    resolve(REPO_ROOT, SHARED_ENUMS_SOURCE_REL),
    SHARED_ENUMS_OUTPUT,
  );
  console.log(`Wrote ${SHARED_ENUMS_OUTPUT}`);
};

generate();
