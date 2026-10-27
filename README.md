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

Altitude, descent rate, tilt, air temperature, pressure, and the carrier level follow the public [Huygens integrated timeline](https://atmos.nmsu.edu/data_and_services/atmospheres_data/Huygens/Integrated_Timesline.html). The opening minute is extended up to a 157 km parachute deployment because that table begins near 146 km.

The ground mosaic, the surface photographs, the Moon comparison, the downward spectra, and the exposure counters come from the ESA Planetary Science Archive volume [HP-SSA-DISR-2-3-EDR-RDR-V1.3](https://archives.esac.esa.int/psa/ftp/CASSINI-HUYGENS/DISR/HP-SSA-DISR-2-3-EDR-RDR-V1.3/). The map is Karkoschka’s 20 m/pixel and 4 m/pixel DISR mosaics, centered on touchdown with north up. Position, sun azimuth, and rotation are the DISR descent-parameter table in that volume. Spectra are the DLVS and DLIS derived products. The post-landing panels are the archive’s processed surface frame, the latest raw DISR frame, and the Moon photograph printed beside it. The mosaics have no world file, so their shared center is placed on the landing coordinates and the published north-up orientation is kept. The surface-lamp counter counts SSL housekeeping records.

Three.js is included under `vendor/` (MIT).
