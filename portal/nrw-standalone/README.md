# NRW Standalone Web App

This is the front end for NRW. It is being developed inside [our fork of the IFRC Go repo](https://github.com/rodekruis/go-web-app).

This project is a wrapper of the core NRW files to allow standalone deployment and testing. All changes to core NRW files must be done in the `go-web-app` repo, and then brought here as part of the submodule checkout in `/src/go-web-app`.

## Setup and running the app

Note: This project requires a running DB populated with admin area data. See [the main README](../../README.md) for the latest information on the setup.

> [!TIP]
> From the repository root, `npm run setup:frontend` performs the setup steps 1–4 below in one command. To build and serve the app you can either run `pnpm start` here (dev server with hot reload, step 5), or `npm run start:frontend` from the root (builds and serves a static preview — this is what the [e2e tests](../../e2e/README.md) use). Both serve on `http://localhost:5173`.

1. Copy the `sample.env` file, rename it as `.env`, and set the required values.
1. Run `git submodule update --init` to get the files in the submodule. This can be done from either the root or from `portal/nrw-standalone`. This will need to be rerun any time the submodule is updated.
1. Set up the submodule for a sparse checkout. From `portal/nrw-standalone/src/go-web-app`, run this: `git sparse-checkout set --no-cone '/app/src/utils/nrw/' '/app/src/components/Nrw/'`
1. From `portal/nrw-standalone`, run `pnpm install` to install all requirements.
1. From the same dir, run `pnpm start` to build and start it.
1. Use an existing link, or enter a valid ISO-A3 country code in the URL to use the app. For instance `http://localhost:5173/nrw?c=MWI`

## Updating your local repo after a submodule change

1. Run `git submodule update --init`.
2. Update your `.env` file if there were changes in `sample.env`.
3. From `portal/nrw-standalone`, run `pnpm install` to update the dependencies if they were changed.
4. From `portal/nrw-standalone`, build with `pnpm build` or build and run with `pnpm start` to check for any other errors.

## Updating the submodule

There are several steps when updating the NRW submodule code from Go. Generally only the first step is needed, but keep in mind the others.

1. **(Required)** Update the submodule itself. Run `git submodule update --remote <relative submodule path>` to update the submodule commit pointer to latest, and commit your change. So from root, the command would be `git submodule update --remote portal/nrw-standalone/src/go-web-app`. This will pull latest based on the branch specified in `.gitmodules`
1. **(Do at least every few months)** Update the binaries as needed. If there have been version changes in the `package.json` in the go-web-app repo for packages that are also used in this standalone project, update those dependencies. Even if this falls behind for many months, it is rarely a problem.
1. **(Do as needed)** Update the sample.env file if there are any changes. Update both your .env file, as well as `./src/utils/envParser.ts` (used to access the variable) and `./src/vite-env.d.ts` (used by the IDE for type safety).
1. **(Do as needed)** Update any wrappers or helpers in this project as needed. This is rare, but may be needed if NRW has a new dependency in Go. Build errors will normally make it clear if you need this.
1. **(Do as needed)** Bring over new directories from Go as part of the submodule. If there are new dependency directories we need in this project, you need to add them to the submodule checkout. See the section below on how to do that. Build errors will make it clear if you need this.

## Adding directories to the submodule checkout

This submodule was set up using sparse checkout. The exact command was this:

`git sparse-checkout set --no-cone '/app/src/utils/nrw/' '/app/src/components/Nrw/'`

If you need to add more directories to the checkout, such as for `/a-new-dir/my-dir/` you'd run it again like this:

`git sparse-checkout add --no-cone '/a-new-dir/my-dir/'`

Note: `cone` is the default setting and also checks out all files in the base-level directories of all parents of what you check out. `--no-cone` gives you just the directories you indicate.

## Making a PR branch for the front end directly from the submodule

For very large changes, it's better to make and test them from the `go-web-app` project directly so you can correctly handle dependencies from outside the submodule. For most changes though, you can make them directly through this project. Directions are given for VS Code, but other Git UI tools can do this, as well as from command line.

It works similarly to normal branch commits, with two exceptions:

- When you create a new branch in the submodule, it will also change the submodule pointer in the parent repo. Don't check this pointer change in. If you accidentally do, revert it before your PR into main.
- When you want to switch back to the 'main' submodule, instead of changing the branch via the UI or the command line, discard or revert the change in the parent repo to the submodule pointer. In the VS Code UI, you will see the submodule branch change back to the pointer.

Creating a new branch from the submodule works as it would for any repo.

1. Click on the branch name
2. Click on `+ Create New Branch`
3. Type in the branch name and hit enter.
4. You can now commit directly to this branch just like you would to any branch.

Your changes are commited to the `go-web-app` repo, not this repo. Once your PR merges in that repo, you can bring them back into this repo with a submodule update. See the **Updating the submodule** section above.

## Other changes from Go

To match styling, these files outside the submodule had styling copied from Go:

- `/nrw-standalone/src/index.css`
- `/nrw-standalone/src/main.tsx`
- `/nrw-standalone/index.html`

## Deployment

The app is deployed to Azure Static Web Apps by the GitHub Actions workflows in [`.github/workflows`](../../.github/workflows):

- `deploy_test_portal.yml` — deploys to the `test` environment on pushes to `main`, and deploys a preview environment for every pull request that changes the frontend.
- `deploy_staging_portal.yml` — deploys to the `staging` environment, triggered via `deploy_staging_all.yml` (on a published release) or manually.

Both workflows build the app with the shared [`build-frontend`](../../.github/actions/build-frontend/action.yml) action: it checks out the `go-web-app` submodule (sparse), installs dependencies with pnpm, and runs `pnpm build`. The build reads its configuration (see `sample.env`) from the GitHub environment instead of an `.env` file:

- `APP_IBF_API_BACKEND` — environment variable, URL of the deployed `api-service`
- `APP_SEED_DATA_REPO` — environment variable, base URL of the seed-data repository
- `APP_MAPBOX_ACCESS_TOKEN` — environment secret
- `AZURE_STATIC_WEB_APPS_API_TOKEN_PORTAL` — environment secret, deployment token of the Azure Static Web App

[`public/staticwebapp.config.json`](./public/staticwebapp.config.json) configures the Static Web App (SPA fallback to `index.html`, caching and security headers). Vite copies it to the root of the `dist/` build output.
