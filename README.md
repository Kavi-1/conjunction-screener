# Conjunction Screener

[Live site](https://kavi-conjunction-screener.vercel.app/)

I built this to track satellites, find passes overhead, and check when two objects might come close. It also replays the 2009 Iridium–Cosmos collision and shows asteroid predictions from NASA JPL.

I used Next.js, TypeScript, and globe.gl/Three.js for the interface. satellite.js handles SGP4 orbit calculations.

## How it works

For satellite screening, I:

1. Calculate positions with SGP4 and reuse them between pairs.
2. Filter out pairs whose orbit heights are too far apart.
3. Compare bounding boxes around their predicted paths.
4. Find closest approach and report the time, distance, relative speed, and orbit data age.

Both filters allow for movement between samples. Screening and pass prediction run in Web Workers so they do not block the page.

The default checks 300 low-Earth-orbit objects over 24 hours, with a 10 km distance limit. In a test starting September 12, 2026 at 12:00 UTC, the filters reduced 44,850 pairs to 41,867, then 21,015. Counts depend on the catalog.

## Checks

- Three SGP4 reference cases, nine positions: maximum difference **0.004548 km**. This checks part of the reference suite, not real-world position accuracy.
- [2009 replay](https://celestrak.org/events/collision/): **16:55:59.796 UTC**, compared with SOCRATES’ prediction of **16:55:59.806 UTC**. Difference: **−0.010 s**. Neither is a measured collision time.
- Regression tests check that the filters keep real close approaches they previously missed.

## Data and limitations

[CelesTrak](https://celestrak.org/NORAD/documentation/gp-data-formats.php), a nonprofit that mirrors the US Space Force public catalog, provides satellite orbit data. [NASA JPL CNEOS](https://ssd-api.jpl.nasa.gov/doc/cad.html) provides the asteroid predictions. Both feeds are cached. If satellite data is unavailable, the app clearly labels its saved demo data.

I built this for learning, not collision avoidance. Old orbit data can be off by kilometers, and sampling can miss encounters. I do not calculate collision probabilities.

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
