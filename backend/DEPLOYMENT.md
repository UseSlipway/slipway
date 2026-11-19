# Backend deployment

The backend is packaged as a Docker image and deployed from GHCR. GitHub Actions publishes it only from `main` in the private source repository `NotADeveloper7/slipway`; the sanitized public mirror does not publish or deploy it.

## Configure once

1. In Render, create a Docker image service for `ghcr.io/notadeveloper7/slipway-backend:latest`. The package is private by default. Configure GHCR registry access in Render, or make the package public if that is the intended distribution policy.
2. Configure the service's environment variables from `backend/.env.example`. `DATABASE_URL` is required: the process applies database migrations before it starts listening. Render supplies `PORT`.
3. Set the health check path to `/health/`. This is a process liveness check; it does not check PostgreSQL or RPC readiness.
4. Create a Render deploy hook for the image service and save its URL as the `RENDER_DEPLOY_HOOK_URL` Actions secret in the private GitHub repository.

## Each deployment

On a push to private `main`, `.github/workflows/backend.yml` installs the locked Bun dependencies, typechecks the backend, and builds the production Docker image. After that succeeds, it publishes both `latest` and the full commit SHA tag to GHCR. The deploy job then calls Render's hook. If the hook secret is absent, image publishing succeeds and the deploy job reports that it skipped Render.

The image includes the commit SHA in `APP_COMMIT_SHA`, exposed by `GET /health/` for deployment identification. The workflow does not configure or change the Render service's image source; configure the service as described above before enabling its deploy hook.

The root frontend CI is intentionally not part of this backend workflow. Vercel handles frontend builds and deployment. `ci.yml` builds the Foundry contracts separately.
