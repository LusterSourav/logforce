# Deploy Pipeline

Repo `LusterSourav/logforce` branch `main` is the single source of truth.
Two pipelines ship it to Vercel (`logforce.vercel.app`) and Render (`logforce.onrender.com`).

## Pipelines

### A. Hourly batched auto sync

File `.github/workflows/sync-deploy.yml`. Fixed tick every hour at minute zero UTC.

1. Tick reads live `main` SHA plus the `last-shipped` tracker tag with `ls remote`. No checkout, about ten seconds.
2. Tag equals `main` then exit. Zero Vercel builds, zero Render builds.
3. Tag differs then check changed files. Piles that touch only docs, markdown, tests, or workflow files move the tag with no platform build.
4. Else fire the Vercel deploy hook plus the Render deploy hook exactly once for the whole pile. Pushes inside the hour never shift or extend the tick.
5. Verify Render reports `live` on that SHA and Vercel reports `READY` on that SHA, then confirm both public URLs answer HTTP 200.
6. Only after green checks move the `last-shipped` tag to that SHA. Tag moves touch no branch so they trigger zero builds and pollute no history. Failed runs stay red and the next tick retries.

Manual runs also record the SHA, so hourly ticks auto suspend until genuinely new commits land.

### B. Manual instant deploy

File `.github/workflows/deploy-now.yml`. Actions tab, Run workflow, pick `both`, `vercel`, or `render`. Same fire plus verify plus record flow, no idle checks. Fastest path without Actions is curling both hook URLs directly.

## One time setup

Do these in order. The push in step 4 causes one final auto build on each platform, then silence.

1. Render dashboard, service `logforce`, Settings, Auto Deploy set to Off.
2. Same page, copy the Deploy Hook URL.
3. Vercel dashboard, project `logforce`, Settings, Git, create a Deploy Hook for branch `main`. Copy the URL.
4. Commit and push this pipeline. The `vercel.json` change below stops all push triggered Vercel builds after this one deploy.
5. GitHub repo, Settings, Secrets and variables, Actions. Add secrets `VERCEL_DEPLOY_HOOK_URL`, `RENDER_DEPLOY_HOOK_URL`, `RENDER_API_KEY`, `VERCEL_TOKEN`. Add variables `RENDER_SERVICE_ID` set to `srv-dakmdtqd0e5s73eft03g` and `VERCEL_PROJECT_ID` set to `prj_AhFBzxzhdl16iDAqwWopg46n3aG0`.
6. Bootstrap the tracker tag once so the first tick has a baseline. Either let the first tick with changes deploy, or point it by hand at current main with `git tag -f last-shipped <sha>` plus `git push -f origin tag last-shipped`.
7. Optional smoke test. Run Deploy Now Manual with target `both` and watch it go green.

## Key config in repo

`vercel.json` carries `git.deploymentEnabled` set to `false`. That stops every push triggered Vercel build while deploy hooks keep working. Do not remove it or every push burns a Vercel build again.

## Usage math

Idle day means 24 sub minute check runs and zero platform builds. Busy hour with any number of pushes means at most one Vercel build plus one Render build. Docs only pushes cost nothing on either platform.

## Caveats

1. Cron ticks can lag a few minutes under GitHub load. Sixty minutes means sixty plus a small delay in practice.
2. GitHub pauses scheduled workflows after sixty days with zero repo activity. Any push re enables them.
3. Verify needs the API secrets. Hooks alone still deploy, but the run skips API polling and only checks public URLs.
4. Rollback stays free. Vercel keeps every deployment for one click rollback. Render keeps deploy history for rollback.

## Hook rotation

If a hook URL leaks, regenerate it on its dashboard, update the matching GitHub secret, and rerun Deploy Now Manual to confirm green.
