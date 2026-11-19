# Backend deployment

The backend is packaged as a Docker image and deployed from GHCR. CI is scoped to `UseSlipway/slipway`; other repository copies skip these jobs. When `main` is updated, that repository runs checks, publishes the image, and triggers Render.

## Configure once

1. In Render, create a Docker image service for `ghcr.io/useslipway/slipway-backend:latest`. The package is private by default. Configure GHCR registry access in Render, or make the package public if that is the intended distribution policy.
2. Configure the service's environment variables from `backend/.env.example`. `DATABASE_URL` is required: the process applies database migrations before it starts listening. Render supplies `PORT`.
3. Set the liveness check path to `/health/`. `/ready/` checks PostgreSQL, both RPCs, deployed Uniswap v3 factories, and fee-router addresses.
4. Create a Render deploy hook for the image service and save its URL as the `RENDER_DEPLOY_HOOK_URL` Actions secret in the public GitHub repository `UseSlipway/slipway`.

## Each deployment

On updates to `UseSlipway/slipway` `main`, `.github/workflows/backend.yml` installs the locked Bun dependencies, typechecks the backend, and builds the production Docker image. After that succeeds, it publishes both `latest` and the full commit SHA tag to GHCR. The deploy job then calls Render's hook. If the hook secret is absent, image publishing succeeds and the deploy job reports that it skipped Render. Other repository copies skip these CI jobs.

The image includes the commit SHA in `APP_COMMIT_SHA`, exposed by `GET /health/` for deployment identification. The workflow does not configure or change the Render service's image source; configure the service as described above before enabling its deploy hook.

The root frontend CI is intentionally not part of this backend workflow. Vercel handles frontend builds and deployment. `ci.yml` builds the Foundry contracts separately. The API's current on-chain flow resolves Uniswap v3 pools and returns exact-input quotes plus unsigned approve-and-swap payloads through the deployed Slipway fee router.
