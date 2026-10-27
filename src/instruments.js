// The 13 DISR channels the film scores as separate chimes.
// Angles are radians from nadir. Azimuth widths are half-angles.
// paint:true footprints are burned into the surface mosaic.

export const SUN_AZ = 100 * Math.PI / 180;

export const INSTRUMENTS = [
  { id: "HRI", name: "HRI high res", note: 880, color: "#ffffff", rgb: [1, 1, 1], paint: true, th0: 0.06, th1: 0.26, hw: 0.07 },
  { id: "MRI", name: "MRI medium", note: 740, color: "#8fd0ff", rgb: [0.56, 0.82, 1], paint: true, th0: 0.2, th1: 0.72, hw: 0.2 },
  { id: "SLI", name: "SLI side", note: 620, color: "#ffd15a", rgb: [1, 0.82, 0.35], paint: true, th0: 0.72, th1: 1.28, hw: 0.1 },
  { id: "SAI", name: "SAI aureole", note: 523, color: "#ff7eb6", rgb: [1, 0.49, 0.71], paint: false, th0: 1.55, th1: 1.9, hw: 0.22 },
  { id: "DLVS", name: "DLVS vis down", note: 494, color: "#6aa6ff", rgb: [0.42, 0.65, 1], paint: true, th0: 0.12, th1: 0.95, hw: 0.03 },
  { id: "ULVS", name: "ULVS vis up", note: 440, color: "#c5dcff", rgb: [0.77, 0.86, 1], paint: false },
  { id: "DLIS", name: "DLIS ir down", note: 392, color: "#ff6a4a", rgb: [1, 0.42, 0.29], paint: false },
  { id: "ULIS", name: "ULIS ir up", note: 349, color: "#ffb199", rgb: [1, 0.69, 0.6], paint: false },
  { id: "VPD", name: "Violet down", note: 330, color: "#c084fc", rgb: [0.75, 0.52, 0.99], paint: false },
  { id: "VPU", name: "Violet up", note: 294, color: "#e9d5ff", rgb: [0.91, 0.84, 1], paint: false },
  { id: "SUN", name: "Sun sensor", note: 262, color: "#ff3b30", rgb: [1, 0.23, 0.19], paint: false },
  { id: "CAL", name: "Calibration", note: 220, color: "#b6f075", rgb: [0.71, 0.94, 0.46], paint: false },
  { id: "LAMP", name: "Surface lamp", note: 196, color: "#ffcc66", rgb: [1, 0.8, 0.4], paint: false },
];

export const EVENTS = [
  { t: 0, id: "entry", label: "Heat shield in the atmosphere" },
  { t: 2, id: "chute", label: "Pilot and main parachute" },
  { t: 32, id: "shield", label: "Heat shield release" },
  { t: 45, id: "tx", label: "Transmitter on" },
  { t: 62, id: "boom", label: "HASI booms out" },
  { t: 66, id: "cover", label: "DISR cover jettison" },
  { t: 900, id: "stab", label: "Stabilizer parachute" },
  { t: 8745, id: "lamp", label: "Surface lamp on" },
  { t: 8870.172, id: "land", label: "Touchdown" },
  { t: 13203.172, id: "loss", label: "Cassini below the horizon" },
];
