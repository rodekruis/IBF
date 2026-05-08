# NRW Standalone

NOTE: Writing more on this in a side PR, along with changes to other readmes.

## Setup and running the app

1. Run `git submodule update --init --recursive` to get the files in the submodule. This can be done from either the root or from `portal/nrw-standalone`.
2. From `portal/nrw-standalone`, run `pnpm install` to install all requirements.
3. From the same dir, run `pnpm start` to build and start it.
4. Use an existing link, or enter a valid ISO-A3 country code in the URL to use the app. For instance `http://localhost:5173/nrw?c=MWI`

## Updating the submodule

Updating is not automatic. To update the submodule pointer, run the following, and commit the change to the pointer.

`git submodule update --remote portal/nrw-standalone/src/go-web-app`

## Adding directories to the checkout

This was set up using a submodule with sparse checkout. The exact command was this:

`git sparse-checkout set --no-cone '/app/src/utils/nrw/' '/app/src/components/NrwMap/'`

If you need to add more directories to the checkout, such as for `/a-new-dir/my-dir/` you'd run it again like this:

`git sparse-checkout add --no-cone '/a-new-dir/my-dir/'`

Note: `cone` is the default and also checks out all files in the base level dirs of all parents of what you check out. `--no-cone` give you just the directories you indicate.

## Other changes from Go

To match styling, these files outside the submodule had styling copied from GO

- `/nrw-standalone/src/index.css`
- `/nrw-standalone/src/main.tsx`
- `/nrw-standalone/index.html`
