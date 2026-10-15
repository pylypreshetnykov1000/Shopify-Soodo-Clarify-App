# Deploy a staging app to Render

This prepares a hosted test environment, not an App Store launch. Render's Blueprint creates a paid web service and paid PostgreSQL database. Review the costs Render displays before deploying. Nothing is created by merely adding this file to Git.

## 1. Put this project in your own Git repository

Create an empty private GitHub repository, such as `soodo-clarity`. Do not initialize it with a README, license, or gitignore because this project already has files. The current local `origin` points to Shopify's starter repository; change it to your own repository before pushing.

Keep `.env`, `.shopify`, database files, and credentials out of Git. This project's ignore files exclude those paths. Share only the new repository URL when asking for help, not the Shopify Client Secret or database password.

## 2. Create the Render Blueprint

1. Open the Render Dashboard and choose **New → Blueprint**.
2. Connect your repository and select the branch containing this project's `render.yaml`.
3. Review the proposed web service `soodo-clarity` and database `soodo-clarity-db`, both in Frankfurt.
4. Enter the Shopify app's Client ID as `SHOPIFY_API_KEY` and Client Secret as `SHOPIFY_API_SECRET`, directly in Render's secret environment fields.
5. Review the displayed costs and deploy when ready.

The Blueprint connects `DATABASE_URL` to the database's internal PostgreSQL URL. No database password needs to be committed. The app uses Render's `RENDER_EXTERNAL_URL` automatically unless you explicitly set `SHOPIFY_APP_URL`, for example when using a custom domain. Do not set `HOST` to an HTTPS URL: the service binds to `0.0.0.0`.

## 3. Verify startup

The Docker build generates a PostgreSQL Prisma client and compiles the app. Startup applies migrations from `prisma/postgresql/migrations` before starting the server. It does not use the local SQLite database or import demo data.

Wait for the deploy to become live. Open `https://YOUR-ACTUAL-SERVICE.onrender.com/health`. The expected response is `{"status":"ok"}`. The endpoint returns HTTP 503 when it cannot query the database and does not expose credentials or internal errors. Then open the service root URL and verify the Shopify connection page appears.

## 4. Connect the hosted URL to Shopify

After Render assigns the actual service URL, set the app URL and authentication redirects in Shopify's configuration to that exact hostname. Keep the existing product scopes and webhook subscriptions. Use a separate hosted Shopify config to avoid replacing the hosted URL when running local development. Validate the hosted config and release it through Shopify before installing on your development store.

The callback paths used by this project are `/auth/callback` and `/auth/shopify/callback`. The web backend is deployed on Render; a Shopify app configuration release is a separate step. Do not point Shopify to `example.com` or a guessed Render hostname.

## 5. Test the hosted app

Install on a development store. Scan products, review a draft, publish one test product, inspect its storefront page, and restore. Verify authentication, webhooks, token renewal, privacy/uninstall behavior, and database persistence after a restart/redeploy before broader use. The existing QA report documents the remaining simultaneous-external-edit limitation.

## Local versus hosted database

`prisma/schema.prisma` and its existing migrations remain SQLite for local demo/tests. `prisma/postgresql/schema.prisma` contains the same models with a PostgreSQL datasource; production has its own migration history. Run `npm run db:postgres:schema` after changing the shared models, then create the corresponding PostgreSQL migration before deploying. The generation check rejects a stale production schema. Do not generate the PostgreSQL client over a running local dev server, especially on Windows.

Preparation checks validate the PostgreSQL schema and generated migration without connecting to a database. Actual PostgreSQL connectivity and migrations must still be tested on the new Render instance. Docker is unavailable in the current local environment, so a Linux container build has not been executed here.

References: [Render Shopify hosting](https://render.com/docs/deploy-shopify-app), [Blueprint reference](https://render.com/docs/blueprint-spec), [Shopify hosting deployment](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service).
