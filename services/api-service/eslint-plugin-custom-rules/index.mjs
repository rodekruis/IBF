import noMethodApiTags from './rules/no-method-api-tags.mjs';
import noRelativeImportPaths from './rules/no-relative-import-paths.mjs';
import preferObjectParams from './rules/prefer-object-params.mjs';

export default {
  rules: {
    'no-method-api-tags': noMethodApiTags,
    'no-relative-import-paths': noRelativeImportPaths,
    'prefer-object-params': preferObjectParams,
  },
};
