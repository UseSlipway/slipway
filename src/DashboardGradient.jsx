// GetLayers Nacre, nacre-002. Canonical shader and pointer integrator; Slipway palette.
import React,{useEffect,useRef} from 'react';
const CONFIG = {"bgColor": "#f6f0e4", "colorA": "#ded6e8", "colorB": "#f3d99e", "colorC": "#fae9c5", "colorD": "#fffdf8", "scale": 1.18, "speed": 0.33, "flow": 0.11, "warp": 0.72, "warpScale": 0.82, "roughness": 0.44, "lacunarity": 1.72, "stretch": 3.9, "stretchDecay": 0.82, "grainAngle": 0.28, "curve": 0.35, "film": 0.34, "relief": 1.2, "orders": 0.55, "drift": 0.05, "washout": 0.1, "iridescence": 0.95, "contrast": 0.95, "midpoint": 0.48, "sink": 0.09, "sheen": 0.12, "grain": 0, "grainAnim": 0, "dither": 1.5, "vignette": 0.05, "cursor": 1, "pointerRadius": 0.7, "pointerStrength": 0.11, "pointerThin": 0.2, "pointerWake": 0.26, "parallax": 0.005, "maxDpr": 1};
export default function DashboardGradient(){
 const ref=useRef(null);
 useEffect(()=>{
 const canvas=ref.current;
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power'});
 if(!gl)return;
 function hexToVec3(hex){const n=parseInt(hex.slice(1),16);return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255]}
const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/* ====== THE SHADER — ⭐ the only part that changes between gradients ====== */
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  iResolution;
uniform float iTime;
uniform vec2  iMouse;          // aspect-corrected units, same space as uv
uniform float iPointerVel;     // 0..1, smoothed — how hard the pointer is being moved

uniform vec3  uBg, uColorA, uColorB, uColorC, uColorD;
uniform float uScale, uSpeed, uFlow, uWarp, uWarpScale, uRoughness, uLacunarity;
uniform float uStretch, uStretchDecay, uGrainAngle;
uniform float uCurve, uFilm, uRelief, uOrders, uDrift, uWashout, uIridescence;
uniform float uContrast, uMidpoint;
uniform float uSink, uSheen, uGrain, uDither, uVignette;
uniform float uPointerRadius, uPointerStrength, uPointerThin, uPointerWake, uParallax;

#define OCTAVES 4

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float snoise(vec2 p) {
  const float K1 = 0.366025404, K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));
  return dot(n, vec3(70.0));
}

vec2 rot(vec2 v, float a) {
  float s = sin(a), c = cos(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// fbm in the grain frame: every octave is sampled through a stretched x, so each
// one stays elongated instead of the fine layers turning to crunch under the smear.
// Each octave is also turned by a fixed twist *after* the stretch — a rotation is
// an isometry, so the smear direction survives untouched while the simplex
// lattices stop stacking. Fringe contours are steep enough here to draw the grid
// otherwise, in stair-steps along every band.
float fbmS(vec2 p) {
  const mat2 R = mat2(0.80, -0.60, 0.60, 0.80);
  mat2 m = mat2(1.0, 0.0, 0.0, 1.0);
  float v = 0.0, amp = 0.5, len = uStretch;
  for (int i = 0; i < OCTAVES; i++) {
    v += amp * snoise(m * vec2(p.x / max(0.05, len), p.y));
    m = R * m;
    p *= uLacunarity;
    amp *= uRoughness;
    len *= uStretchDecay;
  }
  return v;
}

vec3 ramp4(float t) {
  vec3 c = mix(uColorA, uColorB, smoothstep(0.00, 0.36, t));
  c = mix(c, uColorC, smoothstep(0.32, 0.70, t));
  c = mix(c, uColorD, smoothstep(0.66, 1.00, t));
  return c;
}

// triangular-PDF dither — the only reliable cure for 8-bit gradient banding
float triDither(vec2 fc) {
  float a = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(fc + 17.0, vec2(12.9898, 78.233))) * 43758.5453);
  return (a + b - 1.0) / 255.0;
}


// ---- house grain. ONE look across the collection: an integer hash (no sin() streaks),
// triangular so it reads as film rather than static, weighted into the midtones so it
// never crusts a black or a white. Static by default; uGrainAnim re-seeds it 24×/s.
uniform float uGrainAnim;
float houseGrain(vec2 fc) {
  uvec2 q = uvec2(fc) * uvec2(1597334677u, 3812015801u)
          + uint(floor(iTime * 24.0 * uGrainAnim)) * 2654435769u;
  uint n = q.x ^ q.y; n = n * 1664525u + 1013904223u; n ^= n >> 16u; n *= 2246822519u; n ^= n >> 13u;
  float a = float(n & 0xffffu) / 65535.0;
  n *= 3266489917u; n ^= n >> 16u;
  float b = float(n & 0xffffu) / 65535.0;
  return a + b - 1.0;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float t = iTime * uSpeed;

  // pointer — the film thins under it and the viewing angle leans toward it.
  // d * falloff, never normalize(d): no singularity where the cursor sits.
  vec2 d = uv - iMouse;
  float near = exp(-dot(d, d) / max(1e-4, uPointerRadius * uPointerRadius));

  // the shell's own frame: leaned toward the pointer, then rotated onto the grain axis
  vec2 sp = rot((uv - iMouse * uParallax) * uScale, uGrainAngle);

  // thickness field — a stretched, domain-warped fbm. Only the x channel of the
  // warp is noise; the y channel is a counter-running sine, which is the cheap
  // half of the house warp and enough to stop the smear reading as a pan.
  float w = fbmS(sp * uWarpScale + vec2(0.0, t * uFlow));
  vec2 q = vec2(w, sin(sp.y * 1.3 - t * uFlow * 0.63) * 0.5);
  float h = fbmS(sp + uWarp * q + vec2(t * 0.15, -t * 0.11)) * 0.5 + 0.5;
  float f = clamp((h - uMidpoint) * uContrast + 0.5, 0.0, 1.0);

  // optical path through the film. The shell is curved, so light leaving it
  // off-axis crosses more film — which is what crowds the fringes toward the rim
  // and reads as a dome rather than as a flat sheet of noise.
  float sec = 1.0 + uCurve * dot(uv, uv);
  float thick = (uFilm + f * uRelief) * sec * (1.0 - near * uPointerThin);

  // interference: the same palette, walked over and over as the film thickens.
  // Ping-ponged (up, then back) so consecutive orders join with no seam — ramp4
  // is flat at both ends, so the fold is smooth in the derivative too.
  float phase = thick * uOrders + t * uDrift + iMouse.x * uPointerStrength + iPointerVel * uPointerWake;
  vec3 irid = ramp4(abs(fract(phase) * 2.0 - 1.0));

  // fringe visibility dies with thickness, as it does on real film: the thin
  // regions carry the colour and the thick ones wash back to the plain ramp
  float vis = clamp(uIridescence * exp(-max(thick - uFilm, 0.0) * uWashout), 0.0, 1.0);
  vec3 col = mix(ramp4(f), irid, vis);

  // lustre, then the floor: how far up the ramp the field sinks into the background
  col += uColorD * uSheen * pow(f, 3.0);
  col = mix(uBg, col, smoothstep(0.0, max(0.01, uSink), f) * 0.90 + 0.10);

  col *= 1.0 - uVignette * dot(uv, uv);
  { float hgL = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    col += houseGrain(gl_FragCoord.xy) * uGrain * mix(1.0, 4.0 * hgL * (1.0 - hgL), 0.6); }
  col += triDither(gl_FragCoord.xy) * uDither;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

function compile(type, src) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh))
  return sh
}

const program = gl.createProgram()
const vertex = compile(gl.VERTEX_SHADER, VERT)
const fragment = compile(gl.FRAGMENT_SHADER, FRAG)
gl.attachShader(program, vertex)
gl.attachShader(program, fragment)
gl.linkProgram(program)
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
gl.useProgram(program)
const vao = gl.createVertexArray()
gl.bindVertexArray(vao)

const LOC = {}
const loc = n => (n in LOC ? LOC[n] : (LOC[n] = gl.getUniformLocation(program, n)))
const u1f = (n, v) => gl.uniform1f(loc(n), v)
const u2f = (n, x, y) => gl.uniform2f(loc(n), x, y)
const u3c = (n, hex) => { const c = hexToVec3(hex); gl.uniform3f(loc(n), c[0], c[1], c[2]) }

/* ====== CONFIG → UNIFORMS ====== */
function applyConfig() {
  gl.useProgram(program)
  u3c('uBg', CONFIG.bgColor)
  u3c('uColorA', CONFIG.colorA)
  u3c('uColorB', CONFIG.colorB)
  u3c('uColorC', CONFIG.colorC)
  u3c('uColorD', CONFIG.colorD)
  u1f('uScale', CONFIG.scale)
  u1f('uSpeed', CONFIG.speed)
  u1f('uFlow', CONFIG.flow)
  u1f('uWarp', CONFIG.warp)
  u1f('uWarpScale', CONFIG.warpScale)
  u1f('uRoughness', CONFIG.roughness)
  u1f('uLacunarity', CONFIG.lacunarity)
  u1f('uStretch', CONFIG.stretch)
  u1f('uStretchDecay', CONFIG.stretchDecay)
  u1f('uGrainAngle', CONFIG.grainAngle)
  u1f('uCurve', CONFIG.curve)
  u1f('uFilm', CONFIG.film)
  u1f('uRelief', CONFIG.relief)
  u1f('uOrders', CONFIG.orders)
  u1f('uDrift', CONFIG.drift)
  u1f('uWashout', CONFIG.washout)
  u1f('uIridescence', CONFIG.iridescence)
  u1f('uContrast', CONFIG.contrast)
  u1f('uMidpoint', CONFIG.midpoint)
  u1f('uSink', CONFIG.sink)
  u1f('uSheen', CONFIG.sheen)
  u1f('uGrain', CONFIG.grain)
  u1f('uGrainAnim', CONFIG.grainAnim)
  u1f('uDither', CONFIG.dither)
  u1f('uVignette', CONFIG.vignette)
  u1f('uPointerRadius', CONFIG.pointerRadius)
  u1f('uPointerStrength', CONFIG.pointerStrength)
  u1f('uPointerThin', CONFIG.pointerThin)
  u1f('uPointerWake', CONFIG.pointerWake)
  u1f('uParallax', CONFIG.parallax)
  resize()
}


 let frameId,resizeId,clock=0,prevT=performance.now();
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const mouse={x:0,y:0,ax:0,ay:0,tx:0,ty:0,vel:0};
 function resize(){const dpr=Math.min(devicePixelRatio||1,CONFIG.maxDpr);const w=Math.max(1,Math.round(canvas.clientWidth*dpr)),h=Math.max(1,Math.round(canvas.clientHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}gl.viewport(0,0,w,h);gl.useProgram(program);u2f('iResolution',w,h)}
 function aim(e){if(reduce.matches)return;const a=innerWidth/innerHeight;mouse.tx=(e.clientX/innerWidth-.5)*a;mouse.ty=.5-e.clientY/innerHeight}
 function frame(now){
  const raw = now - prevT
  prevT = now
  if (document.hidden) return
  const ms = raw > 50 ? 50 : raw < 4.167 ? 4.167 : raw
  const s = ms > 36.7 ? 2.2 : ms * 0.06
  clock += ms * 0.001

  // two-stage ease: a quick follower feeding a slow one. Still O(1) scalars, but
  // the second pole rounds off the corner a single lerp leaves at a direction
  // change — the field swings through a turn instead of hinging on it.
  const kLead = 0.075 * s, kBody = 0.045 * s     // both poles on real time, not frame count
  mouse.ax += (mouse.tx - mouse.ax) * kLead
  mouse.ay += (mouse.ty - mouse.ay) * kLead
  const px = mouse.x, py = mouse.y
  mouse.x += (mouse.ax - mouse.x) * kBody
  mouse.y += (mouse.ay - mouse.y) * kBody

  // how hard the pointer is being moved, smoothed — swells on a flick and takes
  // a couple of seconds to settle, which is the wake that crosses the film
  const dx = mouse.x - px, dy = mouse.y - py
  // divided by the step, so the reading is distance per unit TIME. The same flick used to
  // register at a quarter of the strength on a 120 Hz panel purely because each frame of it
  // covered less ground — the wake it drives now looks the same on every machine.
  const perStep = 1 / (s * s)
  mouse.vel += (Math.min(1, (dx * dx + dy * dy) * perStep * 2400) - mouse.vel) * Math.min(1, 0.05 * s)

  u1f('iTime', clock)
  /* cursor 0: the hand is ignored and the pointer eases back to where it rested — the
     gradient goes fully ambient. Nothing else changes, so it can be flipped live. */
  if (mouse.rest === undefined) mouse.rest = { x: mouse.tx, y: mouse.ty }
  if (!CONFIG.cursor) { mouse.tx = mouse.rest.x; mouse.ty = mouse.rest.y }
  u2f('iMouse', mouse.x, mouse.y)
  u1f('iPointerVel', mouse.vel)
  gl.drawArrays(gl.TRIANGLES, 0, 3)


 if(!reduce.matches&&!document.hidden)frameId=requestAnimationFrame(frame);
 }
 function restart(){cancelAnimationFrame(frameId);prevT=performance.now();if(!document.hidden)frameId=requestAnimationFrame(frame)}
 function onResize(){cancelAnimationFrame(resizeId);resizeId=requestAnimationFrame(()=>{resize();restart()})}
 applyConfig();restart();
 addEventListener('resize',onResize,{passive:true});addEventListener('pointermove',aim,{passive:true});addEventListener('pointerdown',aim,{passive:true});document.addEventListener('visibilitychange',restart);reduce.addEventListener('change',restart);
 return()=>{cancelAnimationFrame(frameId);cancelAnimationFrame(resizeId);removeEventListener('resize',onResize);removeEventListener('pointermove',aim);removeEventListener('pointerdown',aim);document.removeEventListener('visibilitychange',restart);reduce.removeEventListener('change',restart);gl.deleteVertexArray(vao);gl.deleteProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment)};
 },[]);
 return <div className="dashboard-gradient" aria-hidden="true"><canvas ref={ref}/></div>;
}
