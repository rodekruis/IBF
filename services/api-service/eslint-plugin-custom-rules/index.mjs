import noMethodApiTags from './rules/no-method-api-tags.mjs';
import noRelativeImportPaths from './rules/no-relative-import-paths.mjs';

export default {
  rules: {
    'no-method-api-tags': noMethodApiTags,
    'no-relative-import-paths': noRelativeImportPaths,
  },
};
