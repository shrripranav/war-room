# War Room

A 3D crisis map for a Model UN Security Council nuclear-crisis committee. The chair runs everything from a console; delegates watch a read-only map on the projector that updates live.

## Run it

Double-click `Start War Room.command` (macOS), or run `python3 -m http.server 8765` in this folder and open:

- `http://localhost:8765/chair.html`: chair console (bases, transfers, attacks, zones, news, DEFCON, undo)
- `http://localhost:8765/display.html`: delegate crisis map for the projector (`?as=Country` shows one state's view)

Both windows must be open in the same browser on the same machine; they sync over `BroadcastChannel`.

## Data and imagery

- Borders and cities: [Natural Earth](https://www.naturalearthdata.com/) (public domain)
- Military spending and armed forces: World Bank / SIPRI; warhead estimates: Federation of American Scientists, 2025
- Earth textures (Blue Marble, Black Marble, relief, clouds, stars) via [three-globe](https://github.com/vasturiano/three-globe) examples, from NASA imagery
- Globe rendering: [globe.gl](https://github.com/vasturiano/globe.gl)

To rebuild `data/world.js` and `data/cities.js`, download the raw files into `data/raw/` (see `build-data.mjs`) and run `node build-data.mjs`.

Effects and casualty figures are simulation estimates, not predictions.
