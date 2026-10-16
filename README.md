# The Wheel: lunch and after-work drinks

A spin-the-wheel page that picks where the office goes for lunch or for drinks
after work, starting from 31 State St, Boston. Live at **https://wheel.uxpreview.com**. No password,
on purpose. It's kept out of search engines (`noindex`), but anyone with the
link can open it and edit the spots.

## What it does

- **Lunch and Drinks tabs.** Lunch is one wheel of weekday lunch spots, shown in
  a daytime look. Drinks has four wheels: Let it rip (every bar), Comfort
  (familiar bars), Adventure (outside our comfort zone) and Oysters (mostly
  dollar oysters), shown at night. The page opens on Lunch from 10am to 3pm
  Boston time and on Drinks otherwise. Links can pick a tab:
  `wheel.uxpreview.com/#lunch` or `#drinks`.
- **Spin** with the button, the SPIN hub, the Space bar, or by grabbing the
  wheel and flicking it. It ticks, the pointer flaps, the lights chase, and
  confetti fires when it lands. Sound can be turned off with the speaker button.
- **The result card** shows the walk time, rating, address and a one-line vibe.
  For oyster spots it says whether the deal is on right now (Boston time).
  It also has buttons to walk there (Google Maps or Apple Maps), share or copy
  for Slack, spin again, or **veto it**. A veto takes that spot off every wheel
  on that device until 5am the next day.
- **Edit spots** (top right) adds, edits or removes spots on a wheel. The list
  is shared: a change shows up for everyone. Removed spots go to "Recently
  removed" so they can be put back, and "Restore the original list" resets a
  wheel to the starting spots.
- **Details.** Typing a name and pressing Add is the quick way. "Add with
  address, rating…" and the pencil on any spot open the full form: address,
  walk time, Yelp rating, vibe, good to know, website, and the name printed on
  the wheel. Bars also get a deal with its days and hours, so the card can say
  whether it's on right now. Lunch spots get a price and the kind of place.
  The form links to Google Maps and Yelp to look things up, and if the same
  place is already on another wheel it offers to copy those details.
- **Editing a starting spot** saves the office's version for good: later fixes
  to that spot in `data/spots.js` won't overwrite it. Restoring the original
  list for that wheel brings back the starting version.

## Where to change things

| To change | Edit |
|---|---|
| The starting spots, their details and deals | `data/spots.js` |
| Wheel names, taglines, slice colors, confetti, result-card phrases | top of `assets/app.js` (`MODES`, `TONES`, `CONFETTI`, `KICKERS`) |
| Day (Lunch) and night (Drinks) colors | `:root` and `:root[data-tab="lunch"]` at the top of `assets/app.css` |
| When the page opens on Lunch | `assets/boot.js` |
| Look and layout | `assets/app.css` |
| How the spin feels (speed, length, flick sensitivity) | `spin()` and `release` in `assets/wheel.js` |
| Sounds | `assets/sound.js` |
| Rules for adding, editing and removing (limits, duplicates, which details are kept) | `data/ops.js` |
| The add and edit form (fields, labels, hints) | `spotForm` in `index.html`, and "details form" in `assets/app.js` |
| How deal days and hours read ("Mon–Fri, 3–6pm") | `assets/schedule.js` |
| Link preview image | `og.jpg` (re-render from `scripts/og.html`) |

Editing `data/spots.js` changes what the wheels start with and what "Restore"
puts back. Fixes to an existing spot (address, rating, deal hours) also show up
on the live wheel right away, unless someone already edited that spot on the
page. A brand-new spot added to the file appears live only after someone
restores that wheel, or you can just add it on the page. Write a deal as what
it is ("$1 oysters at the bar") and put the days and hours in `when`; the page
spells out the schedule.

## How the shared list works

The live list is one private JSON file (`wheel/spots.json`) in a Vercel Blob
store connected to the `let-it-rip` Vercel project. `api/spots.js` reads it and
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

Pushing to `main` deploys to production (Vercel project `let-it-rip`, team
ryankm). The domain `wheel.uxpreview.com` points there through a CNAME at
Squarespace DNS: `wheel → cname.vercel-dns.com`.

## About the starting data

Researched October 2026. Ratings are Yelp's. Walk times are estimates from map
distance (about 80 meters a minute), so treat them as close, not exact.
Happy-hour deals change often; the card says when a deal was checked.

Closed in 2024 to 2026, so don't add them back: Hennessy's, Clarke's at Faneuil
Hall, The Times Irish Pub, Daiquiris & Daisies, Scholars, Silvertone, Boston
Chops Downtown Crossing, and Cheers Faneuil Hall.

Lunch: Zo is Zo Greek at 92 State St (the Center Plaza Zo closed), Falafel King
is the 260 Washington St shop, and Tatte is the One Boston Place cafe at 201
Washington St. Many downtown lunch spots are weekday-only and close by 2 or 3pm;
the result card says so. Closed or moved, so don't add them back: Sultan's
Kitchen, Durgin-Park, Fóumami, Sakurabana, Clover on School St, and Wheelhouse
on Broad St (it's now a stall in High Street Place).
