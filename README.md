# bbawarrior

Two small web apps for one class, sharing one sign-on:

1. **BBA Section H Organizer** — a password-protected assignment board with picture uploads, filters, solutions, attendance and a shared class board.
2. **College Quiz** — the "are you coming or not" quiz, which posts to Discord on start and finish.

Both read the same account and session keys, so signing in on one signs you in on the other.

## Layout

```
index.html          the organizer, the whole app in one file, no build step
public/assignments.html  byte for byte copy of index.html, so the quiz can serve it
src/                the quiz app (Vite + React + Tailwind)
api/                Vercel serverless endpoints for the shared board
supabase/schema.sql the shared board table, run it once in the Supabase SQL editor
PROJECT_INDEX.md    what was built, what was verified in a browser, what is still unproven
PLAN.md             the plan this work followed
```

## Run the organizer

Open `index.html` in a browser. React, Tailwind, lucide-react and Babel load from CDNs through an import map, so there is nothing to install.

The default admin account is `admin`. Change it from Settings, and give every classmate their own login rather than sharing one.

Hidden admin gate: open `index.html#admin`.

## Run the quiz

```
npm install
npm run dev
```

The quiz needs the organizer served on the same origin for the shared sign-on to see the same accounts, which is what `public/assignments.html` is for.

## Shared board

`api/state.js` and `api/action.js` read and write one Supabase table. Without `SUPABASE_URL` and a secret key set in the Vercel project the API reports offline and both apps fall back to browser storage.

```
1. create a Supabase project
2. run supabase/schema.sql in its SQL editor
3. set these three in Vercel (Project Settings, Environment Variables)
4. redeploy
```

| Variable | Value | Needed for |
| --- | --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | everything |
| `SUPABASE_SECRET_KEY` | the `sb_secret_...` key | reading and writing the board |
| `SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_...` key | the realtime doorbell only |

Supabase renamed these keys. The older names `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are still read, and the new names win when both are set, so an existing deployment keeps working. The values are trimmed and unwrapped before use: a key pasted as `SUPABASE_SECRET_KEY=sb_secret_...`, or with quotes left around it, is refused by Supabase with `Invalid API key` and that reads like a wrong key when it is only a messy paste.

Paste the value on its own. Do not paste the `NAME=value` line, and never commit either key.

The publishable key is public by design and row level security still refuses it, so nothing about the board is readable with it. The secret key bypasses row level security and must stay in Vercel's environment variables, out of the repo and out of chat.

### When sync does not work

Open `https://<your-app>.vercel.app/api/health`. It reports which variable each value came from, what kind of key it is (`secret`, `publishable` or a legacy JWT), a four character fingerprint for spotting a typo, whether the URL looks like a Project URL, whether the table is reachable, and a `remedy` line when it is not. It never prints the key.

## Roles and real time

An admin owns the board. Everyone else has a strictly read only view: no new assignment, no editing, no deleting, no adding or removing pictures, and the status chip is a readout rather than a button that cycles to Completed. Reading, filtering and opening a solution stay open to everyone.

`POST /api/action` enforces this itself rather than trusting the page. It checks the id and password it is sent against the logins stored on the board, and refuses anything that is not an admin with a 403. Hiding a button is a courtesy; that check is the protection.

After an admin saves, the server rings a Supabase Realtime broadcast that carries no board data, only the fact that something changed. Each browser then re-reads `/api/state`, so an admin edit appears for everyone at once instead of on the next poll. The 12 second poll stays as a fallback for when realtime is not configured.

Passwords are still stored as plain text, so the admin password travels with each write over HTTPS and is checked on the server. That is better than an unauthenticated endpoint but it is not real authentication; hashing the passwords would fix it properly.

`SHARED_WEBHOOK_URL` in `src/discord.js` is empty on purpose. Paste a Discord webhook there to have every classmate's browser post, or set one in the admin panel, which only applies to that device.

## Known layout caveat

The repository root holds the organizer's `index.html`, which is also where Vite looks for its entry page. `npm run build` therefore bundles the organizer rather than the quiz. Deploy them separately, or move the quiz into its own folder, before relying on a single Vercel project for both.