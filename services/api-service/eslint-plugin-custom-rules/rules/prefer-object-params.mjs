export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Enforce using a single object parameter (destructured) instead of multiple positional parameters',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [
      {
        type: 'object',
        properties: {
          maxPositionalParams: {
            type: 'integer',
            minimum: 1,
          },
          ignoredMethodNames: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const options = context.options[0] || {};
    const maxPositionalParams = options.maxPositionalParams || 1;
    const ignoredMethodNames = new Set(options.ignoredMethodNames || []);

    function hasDecorators(params) {
      return params.some(
        (param) => param.decorators && param.decorators.length > 0,
      );
    }

    function isInlineCallback(node) {
      const parent = node.parent;
      return (
        parent &&
        parent.type === 'CallExpression' &&
        parent.arguments.includes(node)
      );
    }

    function checkParams(node) {
      const params = node.params || [];
      if (params.length <= maxPositionalParams) {
        return;
      }
      if (hasDecorators(params)) {
        return;
      }
      if (isInlineCallback(node)) {
        return;
      }
      context.report({
        node,
        message: `Functions with more than ${maxPositionalParams} parameter(s) should use a single destructured object parameter instead of ${params.length} positional parameters.`,
      });
    }

    return {
      FunctionDeclaration(node) {
        checkParams(node);
      },
      FunctionExpression(node) {
        if (node.parent?.kind === 'constructor') {
          return;
        }
        if (
          node.parent?.type === 'MethodDefinition' &&
          ignoredMethodNames.has(node.parent.key?.name)
        ) {
          return;
        }
        checkParams(node);
      },
      ArrowFunctionExpression(node) {
        checkParams(node);
      },
    };
  },
};
