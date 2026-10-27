# Huygens DISR, in three dimensions

A browser reconstruction of the [DISR descent film](https://www.youtube.com/watch?v=QbmcoL3OqPk): Huygens falling through Titan’s haze on 14 January 2005, the surface mosaic filling in as the probe spins, and the same instrument readout around it.

The original is a flat data movie by Erich Karkoschka and the DISR team (ESA / NASA / University of Arizona). This scene is an independent WebGL rebuild. It is not the archive film.

```bash
python3 -m http.server 5173
```

Open `http://localhost:5173`.

- **Space** plays and pauses. **Arrows** scrub. **C** switches between the film layout and a free camera beside the probe. **M** mutes.
- The clock runs at the film’s compression: 40× until touchdown, then 100× on the surface.
- Drag and scroll in the fly-alongside view.

Altitude, descent rate, tilt, air temperature, pressure, and the carrier level follow the public [Huygens integrated timeline](https://atmos.nmsu.edu/data_and_services/atmospheres_data/Huygens/Integrated_Timesline.html). The opening minute is extended up to a 157 km parachute deployment because that table begins near 146 km. Easting is an integral of a zonal-wind profile shaped like the published Doppler Wind Experiment curve. Spin, the northward meander, and the painted mosaic are reconstructions of how the probe actually behaved, not extra columns from the table.

Three.js is included under `vendor/` (MIT).
