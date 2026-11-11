// Equally sized, independent model displays. Selection aligns a model in 550 ms;
// its inactive counterpart turns slowly around two axes.
import { ART, sceneGeometry } from './stage-geometry.js';
import { loadStageModel, normalizeStageModel } from './stage-model-assets.js';
import { advanceSceneMotion, createSceneMotion } from './stage-model-motion.js';

const VERTEX_SOURCE = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aSurface;
uniform mat4 uView;
uniform mat4 uProjection;
uniform mat4 uLight;
uniform mat4 uModel;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec4 vLight;
varying vec2 vSurface;
void main() {
  vec4 position = uModel * vec4(aPosition, 1.0);
  vPosition = position.xyz;
  vNormal = mat3(uModel) * aNormal;
  vSurface = aSurface;
  vLight = uLight * position;
  gl_Position = uProjection * uView * position;
}`;
const FRAGMENT_SOURCE = `
precision highp float;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec4 vLight;
varying vec2 vSurface;
uniform vec3 uEye;
uniform vec3 uColor;
uniform float uMetal;
uniform float uRoughness;
uniform float uSelected;
uniform float uDetail;
uniform float uShadows;
uniform sampler2D uShadowMap;
uniform sampler2D uBaseMap;
uniform sampler2D uNormalMap;
uniform float uBaseTexture;
uniform float uNormalTexture;
uniform float uNormalScale;
uniform float uCoating;
const float PI=3.14159265;
vec3 surfaceNormal(vec3 normal) {
#ifdef SURFACE_NORMALS
  if(uNormalTexture>.5) {
    vec3 mapped=texture2D(uNormalMap,vSurface).xyz*2.0-1.0;
    mapped.xy*=uNormalScale*(uCoating>1.5?.42:1.0);
    vec3 dx=dFdx(vPosition),dy=dFdy(vPosition);
    vec2 sx=dFdx(vSurface),sy=dFdy(vSurface);
    vec3 px=cross(dy,normal),py=cross(normal,dx);
    vec3 tangent=px*sx.x+py*sy.x,bitangent=px*sx.y+py*sy.y;
    float scale=inversesqrt(max(max(dot(tangent,tangent),dot(bitangent,bitangent)),.0000001));
    return normalize(mat3(tangent*scale,bitangent*scale,normal)*mapped);
  }
#endif
  return normal;
}
float visibility(vec3 normal) {
  if(uShadows<.5) return 1.0;
  vec3 point=vLight.xyz/vLight.w*.5+.5;
  if(point.x<0.0||point.x>1.0||point.y<0.0||point.y>1.0||point.z>1.0) return 1.0;
  float bias=max(.00028,.00085*(1.0-dot(normal,normalize(vec3(-.4,.9,.6)))));
  float lit=0.0;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) {
    float spread=uDetail>3.5?3.5:1.0;
    vec4 sampleDepth=texture2D(uShadowMap,point.xy+vec2(float(x),float(y))*spread/1024.0);
    float depth=dot(sampleDepth,vec4(1.0/16777216.0,1.0/65536.0,1.0/256.0,1.0));
    lit+=step(point.z-bias,depth);
  }
  return lit/9.0;
}
float softbox(vec3 ray,vec3 direction,vec3 horizontal,float width,float height,float roughness) {
  vec3 vertical=normalize(cross(direction,horizontal));
  float spread=roughness*roughness*.7;
  vec2 size=vec2(width,height)+spread;
  vec2 point=vec2(dot(ray,horizontal),dot(ray,vertical))/size;
  float falloff=exp(-dot(point*point,point*point)*1.5);
  return falloff*smoothstep(.05,.65,dot(ray,direction))*width*height/(size.x*size.y);
}
vec3 environment(vec3 ray,float roughness) {
  vec3 key=normalize(vec3(-.4,.9,.6));
  vec3 rim=normalize(mix(vec3(.6,.48,-.8),vec3(.35,.7,-.65),uSelected));
  vec3 color=mix(vec3(.006,.009,.015),vec3(.11,.14,.19),smoothstep(-.5,.6,ray.y));
  color+=vec3(6.0,6.15,6.35)*(1.0+uSelected*.55)*softbox(ray,key,normalize(cross(vec3(0,1,0),key)),.76,.20,roughness);
  color+=mix(vec3(2.0,2.6,3.4),vec3(2.8,4.5,6.5),uSelected)*softbox(ray,rim,normalize(cross(vec3(0,1,0),rim)),.21,.72,roughness);
  color+=vec3(1.5,1.35,1.15)*softbox(ray,normalize(vec3(-.7,.2,-.2)),normalize(vec3(.2,0,-.7)),.16,.7,roughness);
  return color;
}
vec3 fresnel(float cosine,vec3 reflectance) {
  return reflectance+(1.0-reflectance)*pow(1.0-cosine,5.0);
}
vec3 illumination(vec3 normal,vec3 view,vec3 direction,vec3 radiance,vec3 base,float metal,float roughness) {
  vec3 halfway=normalize(view+direction);
  float nl=max(dot(normal,direction),0.0),nv=max(dot(normal,view),.001);
  float nh=max(dot(normal,halfway),0.0),vh=max(dot(view,halfway),0.0);
  float alpha=roughness*roughness,alphaSquared=alpha*alpha;
  float denominator=nh*nh*(alphaSquared-1.0)+1.0;
  float distribution=alphaSquared/(PI*denominator*denominator);
  float k=(roughness+1.0)*(roughness+1.0)/8.0;
  float geometry=nv/(nv*(1.0-k)+k)*nl/(nl*(1.0-k)+k);
  vec3 reflectance=fresnel(vh,mix(vec3(.04),base,metal));
  vec3 specular=distribution*geometry*reflectance/max(4.0*nv*nl,.001);
  vec3 diffuse=(1.0-reflectance)*(1.0-metal)*base/PI;
  return (diffuse+specular)*radiance*nl;
}
void main() {
  vec3 normal=surfaceNormal(normalize(vNormal));
  vec3 view=normalize(uEye-vPosition);
  if(dot(normal,view)<0.0) normal=-normal;
  float light=visibility(normal);
  vec3 base=uColor;
  if(uBaseTexture>.5) base*=pow(texture2D(uBaseMap,vSurface).rgb,vec3(2.2));
  float metal=uMetal,roughness=max(.2,uRoughness);
  if(uCoating>2.5) {
    base=mix(vec3(.92,.88,.80),vec3(.035,.23,.75),uSelected);
    metal=mix(.12,.48,uSelected);
    roughness=.25;
  } else if(uCoating>1.5) {
    base*=mix(vec3(.95,.90,.80),vec3(.12,.40,.95),uSelected);
    metal=.025;
    roughness=.82;
  } else if(uCoating>.5) {
    base*=mix(vec3(1.0),vec3(.11,.38,1.0),uSelected*.85);
    roughness=max(.25,roughness-uSelected*.08);
  }
  vec3 reflectance=mix(vec3(.04),base,metal);
  float nv=max(dot(normal,view),0.0);
  vec3 reflection=fresnel(nv,reflectance);
  vec3 color=base*(1.0-metal)*(.13+.12*max(normal.y,0.0)+uSelected*.12);
  color+=environment(reflect(-view,normal),roughness)*reflection*(1.0-roughness*.45);
  color+=illumination(normal,view,normalize(vec3(-.4,.9,.6)),vec3(2.7,2.6,2.45)*(1.0+uSelected*.45)*(.12+.88*light),base,metal,roughness);
  color+=illumination(normal,view,normalize(vec3(.65,.4,-.75)),mix(vec3(.65,.85,1.25),vec3(1.0,1.9,3.5),uSelected),base,metal,roughness);
  if(uSelected>.001) color+=illumination(normal,view,normalize(view+vec3(0,.3,0)),vec3(2.15,2.4,2.8)*uSelected,base,metal,roughness);
  if(uDetail>.5&&uDetail<1.5) color*=.97+.03*cos((vPosition.x+vPosition.z)*170.0)*cos((vPosition.x-vPosition.z)*170.0);
  color+=vec3(.10,.32,.65)*pow(1.0-nv,3.0)*uSelected;
  float luminance=dot(color,vec3(.2126,.7152,.0722));
  color=mix(vec3(luminance),color,.12+.88*uSelected)*(.45+.55*uSelected);
  color=clamp((color*(2.51*color+.03))/(color*(2.43*color+.59)+.14),0.0,1.0);
  gl_FragColor=vec4(pow(color,vec3(1.0/2.2)),.22+.78*uSelected);
}
`;
const SHADOW_VERTEX = `attribute vec3 aPosition;uniform mat4 uLight;uniform mat4 uModel;void main(){gl_Position=uLight*uModel*vec4(aPosition,1.0);}`;
const SHADOW_FRAGMENT = `precision highp float;void main(){vec4 value=fract(gl_FragCoord.z*vec4(16777216.0,65536.0,256.0,1.0));value-=value.xxyz*vec4(0.0,1.0/256.0,1.0/256.0,1.0/256.0);gl_FragColor=value;}`;
const subtract = (a, b) => a.map((value, index) => value - b[index]);
const normalize = (a) => a.map((value) => value / Math.hypot(...a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
function viewMatrix(eye, target) {
  const z = normalize(subtract(eye, target)),
    x = normalize(cross([0, 1, 0], z)),
    y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
const orthographic = (width, height) => new Float32Array([2 / width, 0, 0, 0, 0, 2 / height, 0, 0, 0, 0, -2 / 30, 0, 0, 0, -1, 1]);
function product(first, second) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++)
      for (let index = 0; index < 4; index++) result[column * 4 + row] += first[index * 4 + row] * second[column * 4 + index];
  return result;
}

export async function initStageModels() {
  const canvas = document.getElementById('stageModels'),
    stage = document.getElementById('stage');
  if (!canvas || !stage) return;
  stage.dataset.models = 'loading';
  const fallback = () => {
    document.getElementById('stageModelFallback').src = './assets/art/mono.webp';
    stage.dataset.models = 'fallback';
  };
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
  });
  if (!gl) return fallback();
  function program(vertexSource, fragmentSource) {
    const result = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(result, shader);
    }
    gl.bindAttribLocation(result, 0, 'aPosition');
    gl.bindAttribLocation(result, 1, 'aNormal');
    gl.bindAttribLocation(result, 2, 'aSurface');
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(result));
    return result;
  }
  let mainProgram, shadowProgram;
  try {
    const derivatives = gl.getExtension('OES_standard_derivatives');
    mainProgram = program(
      VERTEX_SOURCE,
      (derivatives ? '#extension GL_OES_standard_derivatives : enable\n#define SURFACE_NORMALS\n' : '') + FRAGMENT_SOURCE,
    );
    shadowProgram = program(SHADOW_VERTEX, SHADOW_FRAGMENT);
  } catch (error) {
    console.error('The 3D stage could not start:', error);
    fallback();
    return;
  }
  const uniforms = Object.fromEntries(
    [
      'View',
      'Projection',
      'Light',
      'Model',
      'Eye',
      'Color',
      'Metal',
      'Roughness',
      'Selected',
      'Detail',
      'Shadows',
      'ShadowMap',
      'BaseMap',
      'NormalMap',
      'BaseTexture',
      'NormalTexture',
      'NormalScale',
      'Coating',
    ].map((name) => [name, gl.getUniformLocation(mainProgram, `u${name}`)]),
  );
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enableVertexAttribArray(0);
  gl.enableVertexAttribArray(1);
  gl.enableVertexAttribArray(2);
  function upload(parts) {
    return parts.map((part) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, part.vertices, gl.STATIC_DRAW);
      return { buffer, count: part.vertices.length / 8, material: part.material };
    });
  }
  const camera = { target: [0, 0, 0], azimuth: -0.68, elevation: 0.24, width: 2.55 };
  let assets;
  try {
    const [car, driver] = await Promise.all([
      loadStageModel('./assets/models/racing-car.glb'),
      loadStageModel('./assets/models/racing-driver.glb'),
    ]);
    assets = { car: normalizeStageModel(car, camera), driver: normalizeStageModel(driver, camera) };
    const textures = new Map();
    for (const asset of Object.values(assets))
      for (const part of asset.parts) {
        for (const name of ['baseTexture', 'normalTexture']) {
          const source = part.material[name];
          if (!source) continue;
          if (!textures.has(source)) {
            const bitmap = await createImageBitmap(new Blob([source.bytes], { type: source.type }), { colorSpaceConversion: 'none' });
            const texture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
            gl.generateMipmap(gl.TEXTURE_2D);
            bitmap.close();
            textures.set(source, texture);
          }
          part.material[name] = textures.get(source);
        }
      }
  } catch (error) {
    console.error('The 3D models could not load:', error);
    fallback();
    return;
  }
  const actors = Object.fromEntries(Object.entries(assets).map(([name, asset]) => [name, { parts: upload(asset.parts) }]));
  const bind = (part) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, part.buffer);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
  };
  const light = product(orthographic(3.6, 3.6), viewMatrix([-4, 7, 5], [0, 0, 0]));
  const shadowTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1024, 1024, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.NEAREST);
  for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 1024, 1024);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shadowTexture, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  const shadows = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const horizontal = Math.cos(camera.elevation) * 10;
  const eye = [Math.sin(camera.azimuth) * horizontal, Math.sin(camera.elevation) * 10, Math.cos(camera.azimuth) * horizontal];
  const view = viewMatrix(eye, camera.target);
  const motion = createSceneMotion();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let intersecting = true,
    dirty = true,
    lastDraw = -Infinity,
    frame = 0,
    presentation;
  const canAnimate = () =>
    !reducedMotion.matches && !document.hidden && intersecting && ['ratings', 'home'].includes(document.body.dataset.page);

  function drawDepth(actor, matrix, projection) {
    gl.useProgram(shadowProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProgram, 'uLight'), false, projection);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowProgram, 'uModel'), false, matrix);
    for (const part of actor.parts) {
      bind(part);
      gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
  }
  function drawModel(name, actor, matrix, selected, projection) {
    gl.useProgram(mainProgram);
    gl.uniformMatrix4fv(uniforms.View, false, view);
    gl.uniformMatrix4fv(uniforms.Projection, false, projection);
    gl.uniformMatrix4fv(uniforms.Light, false, light);
    gl.uniformMatrix4fv(uniforms.Model, false, matrix);
    gl.uniform3fv(uniforms.Eye, eye);
    gl.uniform1f(uniforms.Shadows, shadows ? 1 : 0);
    gl.uniform1f(uniforms.Selected, selected);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shadowTexture);
    gl.uniform1i(uniforms.ShadowMap, 0);
    for (const part of actor.parts) {
      bind(part);
      gl.uniform3fv(uniforms.Color, part.material.color);
      gl.uniform1f(uniforms.Metal, part.material.metal);
      gl.uniform1f(uniforms.Roughness, part.material.roughness);
      gl.uniform1f(uniforms.Detail, part.material.detail ?? 0);
      const coating =
        name === 'driver' && part.material.name === 'Polished aluminium'
          ? 3
          : part.material.name === 'Silver technical fabric'
            ? 2
            : name === 'car' && part.material.name === 'Brushed titanium'
              ? 1
              : 0;
      gl.uniform1f(uniforms.Coating, coating);
      gl.uniform1f(uniforms.BaseTexture, part.material.baseTexture ? 1 : 0);
      gl.uniform1f(uniforms.NormalTexture, part.material.normalTexture ? 1 : 0);
      gl.uniform1f(uniforms.NormalScale, part.material.normalScale ?? 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, part.material.baseTexture || shadowTexture);
      gl.uniform1i(uniforms.BaseMap, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, part.material.normalTexture || shadowTexture);
      gl.uniform1i(uniforms.NormalMap, 2);
      gl.drawArrays(gl.TRIANGLES, 0, part.count);
    }
  }
  function render(now) {
    frame = 0;
    if (gl.isContextLost() || stage.dataset.models === 'fallback') return;
    if (document.hidden || !intersecting) {
      stage.dataset.motion = 'suspended';
      return;
    }
    const changing = motion.subject !== stage.dataset.subject || presentation?.transitioning;
    if (now - lastDraw < 1000 / (changing ? 60 : 30) - 1 && !dirty) {
      if (canAnimate()) schedule();
      return;
    }
    dirty = false;
    lastDraw = now;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    presentation = advanceSceneMotion(motion, { now, subject: stage.dataset.subject, reducedMotion: !canAnimate() });
    const density = Math.min(devicePixelRatio || 1, 1.5);
    const width = Math.round(box.width * density),
      height = Math.round(box.height * density);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const geometry = sceneGeometry(stage.clientWidth, stage.clientHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for (const [name, actor] of Object.entries(actors)) {
      const matrix = presentation.matrices[name];
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      if (shadows) {
        // Each display casts shadows only onto its own model.
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, 1024, 1024);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.5, 2);
        drawDepth(actor, matrix, light);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      const rectangle = geometry.viewports[name];
      const w = Math.round((rectangle.width / ART.width) * width),
        h = Math.round((rectangle.height / geometry.artHeight) * height);
      gl.viewport(
        Math.round((rectangle.x / ART.width) * width),
        Math.round(((geometry.artHeight - rectangle.y - rectangle.height) / geometry.artHeight) * height),
        w,
        h,
      );
      const projection = orthographic(camera.width, (camera.width * h) / w);
      // A depth prepass makes the inactive model translucent without showing its rear triangles through the front surface.
      gl.colorMask(false, false, false, false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      drawDepth(actor, matrix, product(projection, view));
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.colorMask(true, true, true, true);
      gl.depthMask(false);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawModel(name, actor, matrix, presentation.selection[name], projection);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    stage.dataset.models = 'ready';
    stage.dataset.shadows = String(shadows);
    stage.dataset.motion = canAnimate() ? 'running' : 'still';
    if (canAnimate()) schedule();
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const invalidate = () => {
    dirty = true;
    schedule();
  };
  new IntersectionObserver(([entry]) => {
    intersecting = entry.isIntersecting;
    invalidate();
  }).observe(canvas);
  new ResizeObserver(invalidate).observe(canvas);
  new MutationObserver(invalidate).observe(stage, { attributes: true, attributeFilter: ['data-subject', 'data-layout'] });
  document.addEventListener('visibilitychange', invalidate);
  reducedMotion.addEventListener('change', invalidate);
  window.addEventListener('f1:workspace-changed', invalidate);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    stage.dataset.motion = 'suspended';
    fallback();
  });
  invalidate();
}
