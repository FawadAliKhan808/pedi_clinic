# White-label demos

This repository is **PediClinic**, a demo platform. It is not a production
app. Each pediatrician we pitch to gets a **white-label demo**: the same app
with their clinic's name, logo and content. The first one is **Crescent
Healthcare** (Dr. Syed Tajamul).

## How it fits together

```
                 one codebase (this repo)
                          │
      ┌───────────────────┼────────────────────┐
      ▼                   ▼                    ▼
 Vercel project      Vercel project       Vercel project
 BRAND=pediclinic    BRAND=crescent       BRAND=<next demo>
      │                   │                    │
      ▼                   ▼                    ▼
 Supabase project    Supabase project     Supabase project
 (clinic data)       (clinic data)        (clinic data)
```

A demo is made of two parts:

| Part | Where it lives | What it holds |
|---|---|---|
| **Brand** (look) | `src/brand/brands/<id>.ts` | Name, home-screen label, description, logo mark, optional colours |
| **Clinic content** (data) | The demo's database, seeded from `scripts/demos/<id>.json` | Clinic name, the doctor's profile, session presets, plus everything parents and staff create |

`NEXT_PUBLIC_BRAND` picks the brand. It is set per deployment and **fixed
at build time**: Next.js bakes it into the pages, the manifest and the
generated icons. Changing it means a redeploy. An unknown value fails the
build instead of shipping a demo with the wrong name on it. When it's not
set, the app uses the base `pediclinic` brand.

The brand decides:

- the name in page titles, headers, the sidebar and the install prompts
  (`brand.name`);
- the label under the home-screen icon (`brand.shortName`, 12 characters
  at most);
- the app icon, favicon and in-app logo, all drawn from `brand.mark` by
  `src/app/icons/mark.tsx`;
- colours, if the brand overrides the base teal and coral (`brand.colors`,
  applied as CSS variables on `<html>`);
- the manifest `id`, so two demos installed on one phone stay two apps.

Screens for our own team (the owner dashboard and its login) say
**PediClinic** (`PLATFORM_NAME`), whatever the brand.

## Adding a demo

1. **Brand.** Copy `src/brand/brands/crescent.ts` to
   `src/brand/brands/<id>.ts`, fill it in, and register it in
   `src/brand/index.ts`. For a new logo shape, add a glyph to
   `src/app/icons/mark.tsx` and to the `mark` type in `src/brand/types.ts`.
2. **Clinic content.** Copy `scripts/demos/crescent.json` to
   `scripts/demos/<id>.json` with the clinic's name and the doctor's
   profile. Put the doctor's photo in `public/` and point `photo` at it.
3. **Database.** Create a Supabase project (region `ap-south-1`), then
   apply the schema and seed it:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   # .env.local pointing at the new project, with NEXT_PUBLIC_BRAND=<id>
   npm run provision
   ```
   Also add the parent test numbers under Authentication → Phone (see
   `supabase/config.toml`, `[auth.sms.test_otp]`).
4. **Deployment.** Create a Vercel project from this repo, add the
   variables from `.env.example` (with `NEXT_PUBLIC_BRAND=<id>` and the new
   Supabase keys), deploy, then run `configure:dispatch` against it (see
   the README's Deploy section).

To preview a brand locally, set `NEXT_PUBLIC_BRAND` in `.env.local` and
restart `npm run dev`.

## Current demos

| Brand id | Name | Database | Notes |
|---|---|---|---|
| `pediclinic` | PediClinic | — | The platform's own look; the default |
| `crescent` | Crescent Healthcare | Supabase `pedi_clinic` (`prspwrhicunbdcpmxlop`, Mumbai) | The crescent logo is a stand-in until the clinic shares its real one |

## Sharing one database

Each demo's database should be its own Supabase project. The schema is
single-clinic (`default_clinic_id()`), so two brands pointed at one project
would show the same doctor, queue and parents. That is fine for a quick
look, not for a pitch.
