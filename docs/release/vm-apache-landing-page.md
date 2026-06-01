# VM Apache Landing Page

This document defines the Linux VM landing-page pattern for private multi-app hosting.

## Goal

When users open the server IP directly on port `80`, they should see a human-friendly landing page with cards for all sub-apps hosted on that VM. The current EasyLink Next.js app remains on port `3000`.

## Source of truth

- Repo assets: `ops/landing-page/`
- Server runtime path: `/var/www/easylink-portal/`
- Apache site config should point document root at that server runtime path.

## Current app registry contract

`apps.json` should contain one object per app with:

- `name`
- `slug`
- `description`
- `href`
- `badge`
- `status_host`
- `status_port`
- `audience`
- `notes`

The landing page should stay config-driven so future apps can be added without rewriting layout code.

## Current VM expectation

- Apache + PHP serve landing page on port `80`
- Next.js app continues on `:3000`
- Landing card for EasyLink should link to `http://<server-ip>:3000/login`

## Design intent

- Bold but calm internal-tools style
- Clear separation between app discovery and direct app usage
- Human-readable status chips
- Good mobile and desktop behavior
- No dependency on external fonts or remote assets

## Future extension

- Add reverse-proxied paths later if needed, but keep the first version simple and robust.
- Additional apps should be added to `apps.json` first, then deployed to the server runtime path.
