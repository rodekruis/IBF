import typeormCascadeOnDelete from './rules/typeorm-cascade-ondelete.mjs';
import noMethodApiTags from './rules/no-method-api-tags.mjs';

export default {
  rules: {
    'typeorm-cascade-ondelete': typeormCascadeOnDelete,
    'no-method-api-tags': noMethodApiTags,
  },
};
