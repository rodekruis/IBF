// Portions of this rule are based on https://github.com/MelvinVermeer/eslint-plugin-no-relative-import-paths
// Copyright (c) Melvin Vermeer
// Licensed under the ISC License. See https://github.com/MelvinVermeer/eslint-plugin-no-relative-import-paths/blob/main/LICENSE
// Adapted for ESLint 10 compatibility (context.cwd / context.filename)
import path from 'node:path';

function isParentFolder(relativeFilePath, context, rootDir) {
  const absoluteRootPath = path.join(context.cwd, rootDir);
  const absoluteFilePath = path.join(
    path.dirname(context.filename),
    relativeFilePath,
  );

  return (
    relativeFilePath.startsWith('../') &&
    (rootDir === '' ||
      (absoluteFilePath.startsWith(absoluteRootPath) &&
        context.filename.startsWith(absoluteRootPath)))
  );
}

function isSameFolder(importPath) {
  return importPath.startsWith('./');
}

function getRelativePathDepth(importPath) {
  let depth = 0;
  let remaining = importPath;
  while (remaining.startsWith('../')) {
    depth += 1;
    remaining = remaining.substring(3);
  }
  return depth;
}

function getAbsolutePath(relativePath, context, rootDir, prefix) {
  return [
    prefix,
    ...path
      .relative(
        path.join(context.cwd, rootDir),
        path.join(path.dirname(context.filename), relativePath),
      )
      .split(path.sep),
  ]
    .filter(String)
    .join('/');
}

const message = 'import statements should have an absolute path';

export default {
  meta: {
    type: 'layout',
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          allowSameFolder: { type: 'boolean' },
          rootDir: { type: 'string' },
          prefix: { type: 'string' },
          allowedDepth: { type: 'number' },
        },
        additionalProperties: false,
      },
    ],
  },
  create: function (context) {
    const { allowedDepth, allowSameFolder, rootDir, prefix } = {
      allowedDepth: context.options[0]?.allowedDepth,
      allowSameFolder: context.options[0]?.allowSameFolder || false,
      rootDir: context.options[0]?.rootDir || '',
      prefix: context.options[0]?.prefix || '',
    };

    return {
      ImportDeclaration: function (node) {
        const importPath = node.source.value;
        if (isParentFolder(importPath, context, rootDir)) {
          if (
            typeof allowedDepth === 'undefined' ||
            getRelativePathDepth(importPath) > allowedDepth
          ) {
            context.report({
              node,
              message: message,
              fix: function (fixer) {
                return fixer.replaceTextRange(
                  [node.source.range[0] + 1, node.source.range[1] - 1],
                  getAbsolutePath(importPath, context, rootDir, prefix),
                );
              },
            });
          }
        }

        if (isSameFolder(importPath) && !allowSameFolder) {
          context.report({
            node,
            message: message,
            fix: function (fixer) {
              return fixer.replaceTextRange(
                [node.source.range[0] + 1, node.source.range[1] - 1],
                getAbsolutePath(importPath, context, rootDir, prefix),
              );
            },
          });
        }
      },
    };
  },
};
