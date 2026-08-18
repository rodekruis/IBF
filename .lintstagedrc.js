// See: https://github.com/lint-staged/lint-staged#using-js-configuration-files
module.exports = {
  '*.{md,json,yml,scss}': 'prettier --write',
  // Run the versions pinned in data/uv.lock.
  '*.py': [
    'uv run --project data ufmt format',
    'uv run --project data ruff check',
  ],
};
