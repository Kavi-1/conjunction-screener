# Conjunction Screener

I built this to visualize satellite orbits, predict overhead passes, and screen for close approaches. It also replays the 2009 Iridium–Cosmos collision and displays asteroid approaches published by NASA JPL.

I use Next.js, TypeScript, and globe.gl/Three.js for the interface, with satellite.js for SGP4 orbit propagation.

## How it works

My screening pipeline runs in a Web Worker:

1. Sample each satellite’s predicted positions once and reuse them.
2. Filter pairs with separated radial ranges.
3. Filter pairs with separated trajectory bounding boxes.
4. Refine close encounters in time and report separation, relative speed, and element age.

The filters allow for travel between samples. Pass prediction also runs off the main thread.

By default, I screen the freshest 300 low-Earth-orbit objects over 24 hours at a 10 km threshold. A test starting September 12, 2026 at 12:00 UTC reduced 44,850 pairs to 41,867 after radial filtering and 21,015 after path filtering. Counts vary by catalog.

## Validation

- Three official SGP4 reference cases, nine positions: maximum difference **0.004548 km** through the app’s timestamp handling. This is a subset, not the full verification suite.
- [2009 replay](https://celestrak.org/events/collision/): computed closest approach at **16:55:59.796 UTC**, versus SOCRATES’ **16:55:59.806 UTC** prediction: **−0.010 s**. This compares predictions, not measured impact timing.
- Regression tests retain real encounters previously lost by the filters.

## Data and limitations

[CelesTrak](https://celestrak.org/NORAD/documentation/gp-data-formats.php), a nonprofit mirroring the US Space Force public catalog, supplies satellite elements. [NASA JPL CNEOS](https://ssd-api.jpl.nasa.gov/doc/cad.html) supplies published asteroid approaches. Server routes cache both feeds; satellite outages use labeled offline fixtures.

This is educational, not operational conjunction assessment. Older elements lose accuracy, sampling can miss encounters, and I do not compute collision probabilities.

## Run locally

Use Node.js 24. No API keys or environment variables needed.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000).

```sh
npm test
npm run lint
npm run build
```
