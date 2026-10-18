# GiftGarden

A web page to **give or sponsor a tree**, fruit or ornamental.
The visitor picks a place, a budget and a tree, personalises a three-line message, leaves their contact details, and the request is sent by e-mail.

## Features

- Home page (title, text, picture, "GO!" button), a one-page form, then a thank-you page.
- Choice of **place** (a city with its coat of arms), **budget** (fixed amounts or free price) and **tree**.
- Tree list with search, availability chips (available, sponsored, unavailable) and a filter.
- Availability rules per tree, per place, per budget and per amount.
- **Premium** trees highlighted and grouped at the end of the list.
- **Message** in three lines: French name and Latin name (prefilled) and a free text with a character counter.
- Request summary, field validation, sending by e-mail.
- **French and English**, light or dark theme.

## Technical overview

- Plain HTML, CSS and JavaScript: no framework, no dependency, no build step.
- Everything that varies lives in `assets/config.json`: texts (per language), places, budgets, per-tree rules, theme, target e-mail address. The code contains no displayed text.
- Trees and cities come from two data files in `assets/data/`: `trees.json` and `cities-FR.json`. Their `id` values are integers that must never be renumbered.
- Only trees with `"available": true` are offered.
- The UI is built with `createElement` and text nodes, never with `innerHTML`: visitor input is never interpreted as HTML.
- A **Content Security Policy** (`<meta>` tag in `index.html`) restricts scripts and styles to the site itself, and network calls to `formsubmit.co`. Adding an external service means updating this policy.
- Requests are sent through [FormSubmit](https://formsubmit.co) (no key needed). If sending fails, the page opens the visitor's mail client with a prefilled `mailto:`.
- City names and coats of arms, tree photos and flags are loaded from Wikimedia and flagcdn.

## Running the project

The page uses `fetch`, so it must be served over HTTP (not `file://`). From the project directory, any static server works, for example:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/>.

## Structure

```
.
├── index.html            page markup
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

To set up a new installation, copy `assets/config-example.json` to `assets/config.json` and adapt it.

## Sending requests

Before the first submission, set `email.toEncoded` to your address encoded in base64 (for example `printf '%s' 'you@example.com' | base64`). The encoding only hides the address from simple scrapers: anyone reading the page code can still decode it. 
On the first submission, FormSubmit writes to that address to activate it: click the link you receive. 
Until it is activated, sending fails and the mail client opens instead.
