# NRW Standalone Web App

This is the front end for NRW. It is being developed inside [our fork of the IFRC Go repo](https://github.com/rodekruis/go-web-app).

This project is a wrapper of the core NRW files to allow standalone deployment and testing. All changes to core NRW files must be done in the `go-web-app` repo, and then brought here as part of the submodule checkout in `/src/go-web-app`. Do not make any changes inside the submodule.

## Setup and running the app

Note: This project requires a running DB populated with admin area data. See [the main README](../../README.md) for the latest information on the setup.

1. Copy the `sample.env` file, rename it as `.env`, and set the required values.
1. Run `git submodule update --init` to get the files in the submodule. This can be done from either the root or from `portal/nrw-standalone`. This will need to be rerun any time the submodule is updated.
1. Set up the submodule for a sparse checkout. From `portal/nrw-standalone/src/go-web-app`, run this: `git sparse-checkout set --no-cone '/app/src/utils/nrw/' '/app/src/components/NrwMap/'`
1. From `portal/nrw-standalone`, run `pnpm install` to install all requirements.
1. From the same dir, run `pnpm start` to build and start it.
1. Use an existing link, or enter a valid ISO-A3 country code in the URL to use the app. For instance `http://localhost:5173/nrw?c=MWI`

## Updating the submodule

There are several steps when updating the NRW submodule code from Go. Generally only the first step is needed, but keep in mind the others.

1. **(Required)** Update the submodule itself. Run `git submodule update --remote <relative submodule path>` to update the submodule commit pointer to latest, and commit your change. The `relative submodule path` would be `portal/nrw-standalone/src/go-web-app` from root, or nothing if run from the submodule dir.
1. **(Do at least every few months)** Update the binaries as needed. If there have been version changes in the `package.json` in the go-web-app repo for packages that are also used in this standalone project, update those dependencies. If this falls behind for many months, it is rarely a problem though.
1. **(Do as needed)** Update any wrappers or helpers in this project as needed. This is rare, but may be needed if NRW has a new dependency in Go. Build errors will normally make it clear if you need this.
1. **(Do as needed)** Bring over new directories from Go as part of the submodule. If there are new dependency directories we need in this project, you need to add them to the submodule checkout. See the section below on how to do that. Build errors will make it clear if you need this.

Note: When other users pull this change, they will need to fetch latest for the submodule with `git submodule update --init`.

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
