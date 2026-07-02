# Deploying omnigrowthpartner.com — GitHub Pages + GoDaddy

The `omnigrowth-site-v8` folder is the complete website. Before uploading, drop two images into it:

- `logo.png` — your logo (until then, a styled text logo shows automatically)
- `founder.jpg` — your photo for the homepage founder section (until then, your initials show)

## Step 1 — Create the GitHub repository

1. Sign up / log in at github.com
2. Click **New repository**, name it `omnigrowth-site` (any name works), set it **Public**, click **Create repository**
3. Click **uploading an existing file**, drag in ALL files from this folder (including the `CNAME` file — it's already set to www.omnigrowthpartner.com), and click **Commit changes**

## Step 2 — Turn on GitHub Pages

1. In the repo: **Settings → Pages**
2. Under "Build and deployment": Source = **Deploy from a branch**, Branch = **main**, folder = **/ (root)**, Save
3. Under "Custom domain", enter `www.omnigrowthpartner.com` and Save
4. Wait a few minutes, then tick **Enforce HTTPS** (appears once the certificate is issued)

## Step 3 — Point GoDaddy at GitHub

In GoDaddy: **My Products → omnigrowthpartner.com → DNS**

Delete any existing A records on `@` and any CNAME on `www` (screenshot them first if unsure), then add:

| Type  | Name | Value                    |
|-------|------|--------------------------|
| CNAME | www  | YOURUSERNAME.github.io   |
| A     | @    | 185.199.108.153          |
| A     | @    | 185.199.109.153          |
| A     | @    | 185.199.110.153          |
| A     | @    | 185.199.111.153          |

Replace `YOURUSERNAME` with your actual GitHub username.

## Step 4 — Wait and verify

- DNS usually propagates in 10–60 minutes (can take up to 48h)
- Visit https://www.omnigrowthpartner.com — the site should load with a padlock
- The bare domain (omnigrowthpartner.com) will redirect to www

## Updating the site later

Edit or replace files in the GitHub repo (the pencil icon, or re-upload) and commit — the live site updates within a minute or two. No other steps needed.

## Notes

- If the domain currently serves a Wix site, it will be replaced the moment DNS switches. Cancel the Wix premium plan afterwards so you're not double-paying.
- Keep the `CNAME` file in the repo — deleting it disconnects the custom domain.
