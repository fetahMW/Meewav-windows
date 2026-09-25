/** Dielectric vinyl, lit by a small deterministic area-light rig. No emission. */
export const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uViewport;
uniform vec3 uDisc;       // CSS centre x/y and outer radius.
uniform vec4 uGeometry;   // inner radius ratio, ellipse ratio, roll, wall thickness.
uniform vec4 uFinish;     // density, exposure, accent, light rotation.
uniform float uLabel;
uniform float uPerspective;
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

float hash(float p) { return fract(sin(p * 127.1 + 17.7) * 43758.5453); }
float noise(float p) {
  float i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(hash(i), hash(i+1.0), f);
}
float filteredNoise(float p) {
  float keep=1.0-smoothstep(0.45,1.3,fwidth(p));
  return mix(0.5,noise(p),keep);
}
float band(float r, float c, float w) {
  return 1.0 - smoothstep(w*0.60, w, abs(r-c));
}
float wave(float p) {
  float width = max(fwidth(p), 0.00001);
  float attenuation = 1.0 - smoothstep(0.32, 0.88, width);
  float sinc = sin(PI*width)/(PI*width);
  return sin(TAU*p) * attenuation * sinc;
}
vec3 linearToSrgb(vec3 x) {
  return mix(12.92*x, 1.055*pow(max(x,vec3(0.0)),vec3(1.0/2.4))-0.055,
    step(vec3(0.0031308),x));
}
// Anisotropic GGX distribution + correlated Smith visibility + Schlick Fresnel.
// Groove slope variance is larger across the groove than along it.
vec3 reflectedLight(vec3 N, vec3 V, vec3 L, vec3 radial, vec3 radiance,
                    float across, float along) {
  vec3 T = normalize(radial - N * dot(N, radial));
  vec3 B = normalize(cross(N,T));
  vec3 H = normalize(V+L);
  float NoV = max(dot(N,V),0.0001), NoL = max(dot(N,L),0.0);
  float NoH = max(dot(N,H),0.0), VoH = max(dot(V,H),0.0);
  float rH = dot(T,H)/across, tH = dot(B,H)/along;
  float denom = rH*rH + tH*tH + NoH*NoH;
  float D = 1.0/(PI*across*along*max(denom*denom,0.00001));
  float visibilityV = NoL * length(vec3(across*dot(T,V),along*dot(B,V),NoV));
  float visibilityL = NoV * length(vec3(across*dot(T,L),along*dot(B,L),NoL));
  float visibility = 0.5/max(visibilityV+visibilityL,0.00001);
  float F = 0.045 + 0.955*pow(1.0-VoH,5.0);
  return radiance * NoL * (F*D*visibility + 0.0015/PI);
}
vec3 rotateLight(vec3 v) {
  float c=cos(uFinish.w), s=sin(uFinish.w);
  return vec3(c*v.x-s*v.z,v.y,s*v.x+c*v.z);
}
// Three samples describe the finite width of each studio strip light.
vec3 softStrip(vec3 N,vec3 V,vec3 radial,vec3 direction,vec3 color,
               float across,float along,float spread) {
  vec3 center=normalize(rotateLight(direction));
  vec3 offset=normalize(cross(center,vec3(0.0,1.0,0.0)))*spread;
  return reflectedLight(N,V,normalize(center-offset),radial,color,across,along)*0.25
       + reflectedLight(N,V,center,radial,color,across,along)*0.50
       + reflectedLight(N,V,normalize(center+offset),radial,color,across,along)*0.25;
}
void main() {
  vec2 screen = vec2(vUv.x*uViewport.x,(1.0-vUv.y)*uViewport.y);
  vec2 p=(screen-uDisc.xy)/uDisc.z;
  float c=cos(uGeometry.z),s=sin(uGeometry.z);
  p=mat2(c,-s,s,c)*p;
  float inner=uGeometry.x, q=uGeometry.y;
  float k=sqrt(1.0-q*q);
  // Inverse projective mapping of the disc plane, rather than an affine oval.
  float denominator=max(q+k*p.y*uPerspective,0.035);
  vec2 plane=vec2(q*p.x,p.y)/denominator;
  float r=length(plane), angle=atan(plane.y,plane.x);
  float aa=max(fwidth(r),0.000001);
  float top=(1.0-smoothstep(1.0-aa,1.0+aa,r))*smoothstep(inner-aa,inner+aa,r);
  float bottomZ=(p.y*(1.0+q*uGeometry.w*uPerspective)-uGeometry.w*k)/denominator;
  float bottomX=p.x*(1.0+q*uGeometry.w*uPerspective-k*bottomZ*uPerspective);
  float bottomR=length(vec2(bottomX,bottomZ));
  float outerWall=(1.0-smoothstep(1.0-aa,1.0+aa,bottomR))
    *smoothstep(1.0-aa,1.0+aa,r);
  outerWall*=smoothstep(-0.04,0.06,plane.y);
  // The far inner wall has visible thickness when the centre is cut out.
  float innerWall=smoothstep(inner-aa,inner+aa,bottomR)
    *(1.0-smoothstep(inner-aa,inner+aa,r));
  innerWall*=1.0-smoothstep(-0.06,0.04,plane.y);
  float wall=max(outerWall,innerWall);
  float alpha=top+wall*(1.0-top);


  vec3 radial=r>0.00001?vec3(plane.x/r,0.0,plane.y/r):vec3(1.0,0.0,0.0);
  vec3 V=normalize(vec3(-plane.x*uPerspective,q,k-plane.y*uPerspective));

  // Recording area / lead-out / run-in. Separators are uncut lands, not raised rings.
  float start=max(inner+0.018,0.355);
  float playing=smoothstep(start,start+0.008,r)*(1.0-smoothstep(0.980,0.987,r));
  float separators=max(band(r,0.53,0.003),max(band(r,0.716,0.0026),band(r,0.854,0.0028)));
  float leadOut=(1.0-smoothstep(0.345,0.365,r))*smoothstep(0.312,0.326,r);

  // Every microgroove has a subtly different pitch and reflectance.
  // Only radial structure is used: never angle-noise fingerprints.
  float phase=r*uFinish.x+0.18*noise(r*33.0)+0.09*noise(r*91.0);
  float groove=wave(phase), harmonic=wave(phase*2.0+0.21);
  float resolved=1.0-smoothstep(0.32,0.90,fwidth(phase));
  float cutVariation=mix(0.5,hash(floor(phase)),resolved);
  float longVariation=filteredNoise(r*780.0)*0.45+filteredNoise(r*151.0)*0.35+filteredNoise(r*43.0)*0.20;
  float grain=0.32*groove+0.11*harmonic+(cutVariation-0.5)*0.21;
  float cut=playing*(1.0-separators);
  float resolvedCoarse=1.0-smoothstep(0.35,1.4,fwidth(r*220.0));
  float musicCuts=(filteredNoise(r*690.0)*0.50 + filteredNoise(r*233.0)*0.35 + filteredNoise(r*83.0)*0.15 - 0.5)*resolvedCoarse;
  float grooveDips=wave(r*261.0+noise(r*13.0)*0.13);
  float cutsContrast=1.0 + musicCuts*1.45 + grooveDips*0.26*cut;
  float across=mix(0.07,0.36+0.09*(longVariation-0.5),cut);
  float along=mix(0.05,0.020,cut);
  along*=1.0+grain*0.90+musicCuts*0.7;
  float slope=(groove*0.014+harmonic*0.006)*cut;
  slope+=wave(r*95.0)*0.024*leadOut;
  // A very small pressed profile and a rounded outer lip, never a thick torus.
  float outerBevel=smoothstep(0.993,0.9995,r);
  float innerBevel=1.0-smoothstep(inner,inner+0.006,r);
  vec3 N=normalize(vec3(0.0,1.0,0.0)+radial*(slope+outerBevel*0.48-innerBevel*0.3));

  float tint=uFinish.z;
  vec3 lilac=mix(vec3(0.92,0.91,1.0),vec3(0.48,0.065,1.0),tint);
  vec3 blue=mix(vec3(0.85,0.91,1.0),vec3(0.13,0.24,1.0),tint);
  vec3 color=vec3(0.0022,0.0023,0.0032)*(0.8+0.2*longVariation);
  color+=softStrip(N,V,radial,vec3(-0.62,0.58,-0.53),lilac*11.0,across,along,0.022);
  color+=softStrip(N,V,radial,vec3(-0.44,0.26,-0.92),lilac*5.5,across,along,0.014);
  color+=softStrip(N,V,radial,vec3(0.62,0.52,-0.48),blue*5.0,across,along,0.024);
  color+=softStrip(N,V,radial,vec3(0.07,0.62,-0.64),vec3(0.87,0.88,0.94)*0.20,across,along,0.028);
  color*=max(0.15,(1.0+grain*0.5)*cutsContrast);
  // Uncut separators remain flat and catch a restrained isotropic reflection.
  color*=1.0-0.30*separators;

  // Sparse low-contrast pressing hairlines, confined to resolved pixels.
  float scuff=(1.0-smoothstep(0.0,0.0006,abs(r-0.913)))
    *(1.0-smoothstep(0.05,0.32,abs(sin(angle-2.2))));
  color*=1.0-scuff*0.07;
  float fineScratches=wave(r*870.0+0.11*sin(angle*3.0)) * 0.018*cut;
  color*=1.0+fineScratches;

  // Optional matte paper label only for the complete-record view.
  float labelMask=(1.0-smoothstep(0.302-aa,0.302+aa,r))*uLabel;
  float paperGrain=(hash(floor(plane.x*1000.0)+floor(plane.y*1000.0)*73.0)-0.5)*0.025;
  vec3 paper=vec3(0.069,0.061,0.059)*(1.0+paperGrain);
  float emboss=band(r,0.119,0.004)+band(r,0.293,0.001);
  paper*=1.0-0.11*emboss;
  color=mix(color,paper,labelMask);

  vec3 wallColor=vec3(0.0015,0.0013,0.0021)+color*0.11;
  color=(color*top+wallColor*wall*(1.0-top))/max(alpha,0.0001);
  color=max(color*uFinish.y,vec3(0.0));
  // A gentle photographic shoulder, encoded exactly once.
  color=color/(vec3(1.0)+color);
  fragColor=alpha<0.001?vec4(0.0):vec4(linearToSrgb(color)*alpha,alpha);
}`;
