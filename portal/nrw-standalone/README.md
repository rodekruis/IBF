# NRW Standalone Web App

This is the front end for NRW. It is being developed inside [our fork of the IFRC Go repo](https://github.com/rodekruis/go-web-app).

This project is a wrapper of the core NRW files to allow standalone deployment and testing. All changes to core NRW files must be done in the `go-web-app` repo, and then brought here as part of the submodule checkout in `/src/go-web-app`. Do not make any changes inside the submodule.

## Setup and running the app

Note: This project requires a running DB populated with admin area data. See [the main README](../../README.md) for the latest information on the setup.

1. Copy the `sample.env` file, rename it as `.env`, and set the required values.
1. Run `git submodule update --init` to get the files in the submodule. This can be done from either the root or from `portal/nrw-standalone`.
1. Set up the submodule for a sparse checkout. From `portal/nrw-standalone/src/go-web-app`, run this: `git sparse-checkout set --no-cone '/app/src/utils/nrw/' '/app/src/components/NrwMap/'`
1. From `portal/nrw-standalone`, run `pnpm install` to install all requirements.
1. From the same dir, run `pnpm start` to build and start it.
1. Use an existing link, or enter a valid ISO-A3 country code in the URL to use the app. For instance `http://localhost:5173/nrw?c=MWI`

## Updating the submodule

This uses a submodule pointer, pointing to a specific commit. To update it to latest, run the following, and commit the change to the submodule pointer.

`git submodule update --remote portal/nrw-standalone/src/go-web-app`

## Adding directories to the submodule checkout

This submodule was set up using sparse checkout. The exact command was this:

`git sparse-checkout set --no-cone '/app/src/utils/nrw/' '/app/src/components/NrwMap/'`

If you need to add more directories to the checkout, such as for `/a-new-dir/my-dir/` you'd run it again like this:

`git sparse-checkout add --no-cone '/a-new-dir/my-dir/'`

Note: `cone` is the default setting and also checks out all files in the base-level directories of all parents of what you check out. `--no-cone` gives you just the directories you indicate.

## Other changes from Go

To match styling, these files outside the submodule had styling copied from Go:

- `/nrw-standalone/src/index.css`
- `/nrw-standalone/src/main.tsx`
- `/nrw-standalone/index.html`
