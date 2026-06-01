# Landing Page Assets

These files are the source of truth for the Linux VM Apache/PHP landing page.

## Deploy target

- Server path: `/var/www/easylink-portal/`
- Apache docroot should point there

## Files

- `index.php` - landing page renderer
- `styles.css` - visual system
- `apps.json` - app card registry
- `apache-easylink-portal.conf` - sample Apache vhost

## Adding another app

1. Add a new entry to `apps.json`
2. Deploy app on its own port or host
3. Sync this folder to `/var/www/easylink-portal/`
4. Reload Apache if config changed
