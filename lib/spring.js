// Closed-form damped harmonic spring, 0 -> 1. Deterministic: depends only on t (seconds).
// stiffness k, damping c, mass m. Underdamped when c < 2*sqrt(k*m).
function spring(t, { stiffness = 170, damping = 14, mass = 1, velocity = 0 } = {}) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const x0 = -1; // displacement from target
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const A = x0, B = (velocity + zeta * w0 * x0) / wd;
    return 1 + Math.exp(-zeta * w0 * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
  }
  const A = x0, B = velocity + w0 * x0;
  return 1 + Math.exp(-w0 * t) * (A + B * t);
}
if (typeof module !== 'undefined') module.exports = { spring };
