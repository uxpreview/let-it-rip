# Let it rip: the after-work wheel

A spin-the-wheel page that picks where the office goes after work, starting
from 31 State St, Boston. Live at **https://wheel.uxpreview.com**. No password,
on purpose. It's kept out of search engines (`noindex`), but anyone with the
link can open it and edit the spots.

## What it does

- **Four wheels:** Let it rip (every spot), Comfort (familiar bars), Adventure
  (outside our comfort zone) and Oysters (mostly dollar oysters).
- **Spin** with the button, the SPIN hub, the Space bar, or by grabbing the
  wheel and flicking it. It ticks, the pointer flaps, the lights chase, and
  confetti fires when it lands. Sound can be turned off with the speaker button.
- **The result card** shows the walk time, rating, address and a one-line vibe.
  For oyster spots it says whether the deal is on right now (Boston time).
  It also has buttons to walk there (Google Maps or Apple Maps), share or copy
  for Slack, spin again, or **veto it**. A veto takes that spot off every wheel
  on that device until 5am the next day.
- **Edit spots** (top right) adds or removes spots on a wheel. The list is
  shared: a change shows up for everyone. Removed spots go to "Recently
  removed" so they can be put back, and "Restore the original list" resets a
  wheel to the starting spots.

## Where to change things

| To change | Edit |
|---|---|
| The starting spots, their details and deals | `data/spots.js` |
| Wheel names, taglines, slice colors, confetti, result-card phrases | top of `assets/app.js` (`MODES`, `TONES`, `CONFETTI`, `KICKERS`) |
| Look and layout | `assets/app.css` |
| How the spin feels (speed, length, flick sensitivity) | `spin()` and `release` in `assets/wheel.js` |
| Sounds | `assets/sound.js` |
| Rules for adding and removing (limits, duplicates) | `data/ops.js` |
| Link preview image | `og.jpg` (re-render from `scripts/og.html`) |

Editing `data/spots.js` changes what the wheels start with and what "Restore"
puts back. Fixes to an existing spot (address, rating, deal hours) also show up
on the live wheel right away. A brand-new spot added to the file appears live
only after someone restores that wheel, or you can just add it on the page.

## How the shared list works

The live list is one private JSON file (`wheel/spots.json`) in a Vercel Blob
store connected to the `wheel` Vercel project. `api/spots.js` reads it and
applies changes. Each save checks that nobody else saved in between, so two
people editing at once can't overwrite each other.

If the Blob store is ever disconnected, the page still works: it falls back to
the starting spots, and edits save on each person's device only. The edit panel
says which mode it's in.

## Run it locally

```bash
npm install
npm run dev     # http://localhost:3200, stores edits in .data/spots.json
npm test        # checks the add/remove rules and the starting data
```

## Deploys

Pushing to `main` deploys to production (Vercel project `wheel`, team ryankm).
The domain `wheel.uxpreview.com` needs a CNAME at Squarespace DNS:
`wheel → cname.vercel-dns.com`.

## About the starting data

Researched October 2026. Ratings are Yelp's. Walk times are estimates from map
distance (about 80 meters a minute), so treat them as close, not exact.
Happy-hour deals change often; the card says when a deal was checked.

Closed in 2024 to 2026, so don't add them back: Hennessy's, Clarke's at Faneuil
Hall, The Times Irish Pub, Daiquiris & Daisies, Scholars, Silvertone, Boston
Chops Downtown Crossing, and Cheers Faneuil Hall.
