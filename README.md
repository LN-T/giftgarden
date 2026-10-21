# GiftGarden

A web page to **give or sponsor a tree**, fruit or ornamental.
The visitor picks a place, a budget and a tree, personalises a three-line message, leaves their contact details, and the request is sent by e-mail.

## Features

- Home page (title, text, picture, "GO!" button), a one-page form, then a thank-you page.
- Choice of **place** (a city with its coat of arms), **budget** (fixed amounts or free price) and **tree**.
- Tree list with search, availability chips (available, sponsored with the sponsor's name, unavailable) and a filter.
- Availability rules per tree, per place, per budget and per amount.
- **Premium** trees highlighted and grouped at the end of the list, behind a separator.
- **Message** in three lines: French name and Latin name (prefilled) and a free text with a character counter.
- Request summary and field validation.
- Thank-you page with the card of the chosen tree and the summary of the request.
- Sending by e-mail, through a form service or through the visitor's mail client.
- **French and English**, light or dark theme.

## Technical overview

- Plain HTML, CSS and JavaScript: no framework, no dependency, no build step.
- Everything that varies lives in `assets/config.json`: texts (per language), places, budgets, per-tree rules, theme, target e-mail address, sending options. The code contains no displayed text.
- Trees and cities come from two data files in `assets/data/`: `trees.json` and `cities-FR.json`. Their `id` values are integers that must never be renumbered.
- Only trees with `"available": true` are offered.
- The UI is built with `createElement` and text nodes, never with `innerHTML`: visitor input is never interpreted as HTML.
- A **Content Security Policy** (`<meta>` tag in `index.html`) restricts scripts and styles to the site itself, and network calls to `formsubmit.co`. Adding an external service means updating this policy.
- By default the request goes through the visitor's mail client (a prefilled `mailto:`). Sending through [FormSubmit](https://formsubmit.co) (no key needed) is optional and off by default; if it fails, the page falls back to the mail client.
- City names and coats of arms, tree photos and flags are loaded from Wikimedia and flagcdn.

## Running the project

The page uses `fetch`, so it must be served over HTTP (not `file://`). From the project directory, any static server works, for example:

```bash
python3 serve.py 8000
```

`serve.py` is a plain static server that sends `Cache-Control: no-store`, so the CSS and JavaScript are never cached. On a real host, set the same header on `assets/*.css` (the asset links carry no version suffix).

Then open <http://localhost:8000/>.

## Structure

```
.
├── index.html            page markup
├── serve.py              local static server, no caching
└── assets/
    ├── app.js            behaviour
    ├── style.css         styles (light / dark theme)
    ├── config.json       configuration and texts
    ├── config-example.json   lighter copy of the config, to get started
    ├── favicon.svg
    └── data/
        ├── trees.json        tree catalogue
        └── cities-FR.json    cities (name and coat of arms)
```

## Configuration

To set up a new installation, copy `assets/config-example.json` to `assets/config.json` and adapt it. The example file shows every setting and its expected format.

### Tree settings (`config.json` > `trees`)

- `source`: the tree catalogue. Only trees with `"available": true` are offered.
- `offerTypes`: limits which tree types are offered.
- `lastIds`: tree ids shown after the other trees of their group (regular or premium).
- `defaultStatusFilter`: availability filter selected by default in the tree step (`all`, `available`, `sponsored` or `unavailable`; missing = `all`).
- `searchMinTrees`: the search bar is hidden when fewer trees than this are offered (missing = always shown).
- `premiumAmounts`, `freePriceTrees`: amounts allowed for premium trees, and trees allowed with a free price.
- `byType` / `byId`: availability rules, keyed by the tree type or by the tree's integer id in the catalogue (`byId` wins; every key is optional, missing = no restriction):
  - `byPlace`: `{ "<city id>": { "status": "unavailable" | "available" | "sponsored", "sponsor": "name shown when sponsored", "premium": true } }` (status defaults to `available`).
  - `note`: key of `texts.<lang>.treeNotes`, shown on the card.
  - `budgets`: list of budget ids allowed for the tree.
  - `minAmount` / `maxAmount`: effective amount limits, in euros.

## Sending requests

The target address is stored base64-encoded in `email.toEncoded` (for example `printf '%s' 'you@example.com' | base64`). The encoding only hides the address from simple scrapers: anyone reading the page code can still decode it.

When the visitor validates the form, they go straight to the thank-you page. The only way out is the 🏠 button in the header (back to the home page). Behind the scenes:

- **FormSubmit on** (`email.formsubmit` is `true`; it is off by default): the request is sent to FormSubmit. On the first submission, FormSubmit writes to the target address to activate it: click the link you receive. While the answer is awaited, the thank-you page shows a loader (for at least `email.minLoaderSeconds`, 5 by default) and the home button is disabled; if the sending is confirmed, the page says so. Only if it fails does the mail-client warning appear.
- **FormSubmit off** (`email.formsubmit` is `false` or missing, the default), **or FormSubmit failed**: the thank-you page tells the visitor that their mail client is about to open with the request prefilled, and that the request only reaches you once they press "Send". The mail client opens a few seconds later (`email.mailClientDelaySeconds`, 4 by default). Until it has opened, the buttons of the page are disabled; an "Open my mail app" button lets the visitor reopen it, in case the browser blocks the automatic opening.

`email.label` (optional) is the display name of the recipient in the mail client, and the first row of the e-mail sent through FormSubmit.
