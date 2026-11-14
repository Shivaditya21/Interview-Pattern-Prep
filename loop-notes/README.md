# Loop Notes (public site)

Type a company and a role. The site searches the web for recent interview reports, reads the top pages,
and returns the interview loop, the reported questions with source and date, a prep plan, and a timed mock round.
Anyone with a Google account can use it. No Claude account is needed.

## What is in this folder

| Path | What it does |
| --- | --- |
| `public/index.html` | The whole front end |
| `api/research.js` | Search, read pages, analyse, cache the report |
| `api/review.js` | Feedback on a mock-round approach |
| `api/feedback.js` | Testers report problems; you read them |
| `api/config.js` | Tells the page the sign-in id and daily limit |
| `lib/core.js` | Shared code: sign-in check, limits, Firecrawl, Claude, prompts |
| `test/run.mjs` | Server checks with stubbed services (`npm test`) |

There are no packages to install. It needs Node 20 or newer, which Vercel provides.

## Deploy it (about 30 minutes, one time)

You need five accounts. Create them in this order and keep each key in a note as you go.

### 1. Anthropic API key (the analysis)
1. Sign up at https://console.anthropic.com and add a payment method or credits.
2. Create an API key. It starts with `sk-ant-`. This is `ANTHROPIC_API_KEY`.
3. Set a monthly spend limit in the console before you share the site.

### 2. Firecrawl API key (web search and page reading)
1. Sign up at https://www.firecrawl.dev and open the dashboard.
2. Copy the API key. It starts with `fc-`. This is `FIRECRAWL_API_KEY`.
   A new search uses 3 searches and up to 5 page reads.

### 3. Upstash Redis (daily limits, saved reports, problem reports)
1. Sign up at https://upstash.com and create a Redis database (the free tier is enough to start).
2. On the database page, open the REST API section and copy the URL and the token.
   These are `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

### 4. GitHub and Vercel (hosting)
1. Create a new repository at https://github.com/new and upload every file in this folder to it.
2. Sign up at https://vercel.com with your GitHub account, choose Add New → Project, and import the repository.
   Leave the framework preset on "Other" and deploy. You get a link such as `https://loop-notes.vercel.app`.

### 5. Google sign-in
1. Open https://console.cloud.google.com, create a project, and set up the OAuth consent screen (External, your app name, your email).
2. Create credentials → OAuth client ID → Web application.
3. Under Authorized JavaScript origins add your Vercel link exactly, with no trailing slash.
4. Copy the Client ID. It ends with `.apps.googleusercontent.com`. This is `GOOGLE_CLIENT_ID`.
5. Publish the consent screen (move it out of Testing), or only the test users you list can sign in.

### 6. Add the keys to Vercel
In Vercel open your project → Settings → Environment Variables and add:

| Name | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | from step 1 |
| `FIRECRAWL_API_KEY` | from step 2 |
| `UPSTASH_REDIS_REST_URL` | from step 3 |
| `UPSTASH_REDIS_REST_TOKEN` | from step 3 |
| `GOOGLE_CLIENT_ID` | from step 5 |
| `ADMIN_KEY` | a long random string you make up |

Then open Deployments and redeploy so the keys take effect.

### 7. Check it
1. Open your link. The line under the search button should ask you to sign in, not say the site isn't set up.
2. Sign in, search one company and role, and confirm the questions come back with source links and dates.
3. Search the same pair again. It should open instantly and say it is a saved report.

## Limits that protect your bill

| Setting | Default | Meaning |
| --- | --- | --- |
| `DAILY_SEARCHES_PER_USER` | 5 | New searches per person per day |
| `DAILY_SEARCHES_TOTAL` | 150 | New searches for the whole site per day |
| `DAILY_REVIEWS_PER_USER` | 20 | Mock-round reviews per person per day |
| `CACHE_DAYS` | 7 | How long a report is reused before it is researched again |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model used for analysis |

Saved reports cost nothing to reopen and don't count against anyone's limit. A failed search is refunded.

## Reading what testers report

Open `https://YOUR-LINK/api/feedback?key=YOUR_ADMIN_KEY`. Each entry has the time, the tester's email,
the company and role, the question if they flagged one, and their message.

## Known limits

- Vercel's free Hobby plan is for personal, non-commercial use. Move to a paid plan before you charge money or run ads.
- Glassdoor, Blind and LeetCode restrict automated reading. The site only reads what the search service returns and links back to the source. Check each source's terms before you grow.
- Sign-in tokens are checked with Google's `tokeninfo` endpoint, which is simple but adds a network call per request. Switch to local signature checks if traffic grows.
- Questions are rewritten summaries of what candidates reported. They can be wrong. That is what the Report button is for.
