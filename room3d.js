import * as THREE from './vendor/three/three.module.min.js';
import { GLTFLoader } from './vendor/three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from './vendor/three/addons/lights/RectAreaLightUniformsLib.js';

import { buildSeason } from './room-season-models.js';
import { sunlightAboveRidge, duskSun, mountDuskControl, standingEye, captureX, valleyTerrain, valleyProjection } from './room-dusk.js';
import { makeValleyTiles, valleyTilesShader } from './room-valley-tiles.js';
import { mountRoomAmbience } from './room-ambient.js';
import { buildWindowBench, handGlaze, roomFinishes, windowBenchBounds } from './room-occasion-details.js';
import { drapeSofaThrow, furnishSideTable } from './room-lounge-details.js';
import { buildHarborFireworks } from './room-fireworks.js';
import { buildReadingCart } from './room-reading-corner.js';
import { bindRoomPlayer, playerEyeHeight, playerLookDown, playerSeatDrop, seatedFacing, stepLength } from './room-player.js';
import { davidRoomX, hallZ, suiteZone, canWalkSuite, doorLeft, doorRight, buildBedroomBed, buildConnectedStructure, buildDavidFurniture, furnitureGrain, addLoungeCushions, dressDavidCoffeeTable } from './room-suite.js';
import { mountRoomCorners } from './room-corners.js';
import { mountHallBoard } from './room-hall-board.js';
import { mountThreshold } from './room-threshold.js';
import { mountRoomPresence } from './room-presence.js';
export { createPreviewRoomExchange } from './room-presence.js';

RectAreaLightUniformsLib.init();
if (window.LynnRoomLocalAssets) {
  THREE.DefaultLoadingManager.setURLModifier(url => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const key = decodeURIComponent(url).split(/[?#]/)[0].match(/assets\/.*$/)?.[0];
    return window.LynnRoomLocalAssets[key] || url;
  });
}

const COLORS = {
  wall: 0xc58eaa,
  wallSoft: 0xe5b9c9,
  wallShade: 0x8c5d82,
  cream: 0xffecdc,
  lavender: 0xa982c4,
  lavenderDark: 0x694981,
  rose: 0xd887a4,
  gold: 0xd9aa5b,
  wood: 0xd9916f,
  woodDark: 0x9b5e59,
  leaf: 0x5c9777,
  night: 0x4b3b78,
  white: 0xffffff,
  ink: 0x442b55
};

const material = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: options.roughness ?? .68,
  metalness: options.metalness ?? 0,
  map: options.map ?? null,
  bumpMap: options.bumpMap ?? null,
  bumpScale: options.bumpScale ?? 0,
  normalMap: options.normalMap ?? null,
  roughnessMap: options.roughnessMap ?? null,
  metalnessMap: options.metalnessMap ?? null,
  aoMap: options.aoMap ?? null,
  aoMapIntensity: options.aoMapIntensity ?? 1,
  emissive: options.emissive ?? 0x000000,
  emissiveIntensity: options.emissiveIntensity ?? 0,
  transparent: options.transparent ?? false,
  opacity: options.opacity ?? 1,
  side: options.side ?? THREE.FrontSide
});

const addMesh = (group, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) => {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
};

const box = (group, size, mat, position, rotation, scale) => addMesh(group, new THREE.BoxGeometry(...size), mat, position, rotation, scale);
const sphere = (group, radius, mat, position, scale = [1, 1, 1]) => addMesh(group, new THREE.SphereGeometry(radius, 24, 18), mat, position, [0, 0, 0], scale);
const cylinder = (group, radiusTop, radiusBottom, height, mat, position, radial = 24, rotation = [0, 0, 0]) => addMesh(group, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial), mat, position, rotation);
const gltfLoader = new GLTFLoader();
const characterAsset='assets/models/room-character/room-character.glb';

function loadRealModel(parent, url, options = {}) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, gltf => {
      const root = gltf.scene;
      if (options.canAttach && !options.canAttach()) {
        disposeObject(root);
        resolve(null);
        return;
      }
      root.name = options.name || 'real-furniture';
      root.rotation.y = options.rotationY || 0;
      root.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(mat => {
          if (!mat) return;
          mat.envMapIntensity = .82;
          if (options.replaceColorMap && mat.map) {
            mat.map.dispose?.();
            mat.map = null;
          }
          if (options.tint && mat.color) options.replaceColorMap ? mat.color.set(options.tint) : mat.color.lerp(new THREE.Color(options.tint), options.tintStrength ?? .18);
          if (Number.isFinite(options.roughness)) mat.roughness = options.roughness;
          if (Number.isFinite(options.metalness)) mat.metalness = options.metalness;
          if (options.lift && mat.emissive) {
            mat.emissive.set(options.lift);
            if (mat.map) mat.emissiveMap = mat.map;
            mat.emissiveIntensity = options.liftIntensity ?? .12;
          }
          if (mat.map) { mat.map.colorSpace = THREE.SRGBColorSpace; mat.map.anisotropy = 8; }
          if (mat.normalMap) mat.normalScale?.set?.(.72,.72);
        });
      });
      const firstBox = new THREE.Box3().setFromObject(root, options.preciseBounds);
      const firstSize = firstBox.getSize(new THREE.Vector3());
      const scale = options.targetWidth ? options.targetWidth / Math.max(firstSize.x,firstSize.z,.001) : options.targetHeight / Math.max(firstSize.y,.001);
      root.scale.set(scale,scale*(options.heightScale ?? 1),scale);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root, options.preciseBounds);
      const center = box.getCenter(new THREE.Vector3());
      const [x,y,z] = options.position || [0,0,0];
      root.position.set(x-center.x,y-box.min.y,z-center.z);
      parent.add(root);
      resolve(root);
    }, undefined, reject);
  });
}

function trimFrame(group, x, y, width, height, z, mat) {
  const thickness = .055;
  const pieces = [
    box(group, [width, thickness, .06], mat, [x, y + height / 2, z]),
    box(group, [width, thickness, .06], mat, [x, y - height / 2, z]),
    box(group, [thickness, height, .06], mat, [x - width / 2, y, z]),
    box(group, [thickness, height, .06], mat, [x + width / 2, y, z])
  ];
  pieces.forEach(piece => { piece.castShadow=false; });
}

function plasterTexture() {
  const texture = canvasTexture(512, 512, (ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#e3ddd4'); gradient.addColorStop(.48, '#ded8d0'); gradient.addColorStop(1, '#d8d1c9');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < image.data.length; i += 4) {
      const noise = (Math.random() - .5) * 5;
      image.data[i] += noise; image.data[i + 1] += noise; image.data[i + 2] += noise;
    }
    ctx.putImageData(image, 0, 0);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(3, 2);
  return texture;
}

function woodTexture() {
  const texture = canvasTexture(1024, 1024, (ctx, width, height) => {
    ctx.fillStyle = '#8b5a43'; ctx.fillRect(0, 0, width, height);
    const rows = 18, columns = 5, rowHeight = height / rows, plankWidth = width / columns;
    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 ? -plankWidth / 2 : 0;
      for (let col = -1; col <= columns; col += 1) {
        const x = offset + col * plankWidth;
        const hue = 20 + ((row * 3 + col * 2) % 5);
        ctx.fillStyle = `hsl(${hue} 32% ${37 + ((row + col + 8) % 4) * 2}%)`;
        ctx.fillRect(x + 1.5, row * rowHeight + 1.5, plankWidth - 3, rowHeight - 3);
        ctx.strokeStyle = '#4d2d2644'; ctx.lineWidth = 1.35;
        for (let grain = 0; grain < 4; grain += 1) {
          ctx.beginPath();
          ctx.moveTo(x + 10, row * rowHeight + 9 + grain * 10);
          ctx.bezierCurveTo(x + plankWidth * .3, row * rowHeight + 5 + grain * 12, x + plankWidth * .66, row * rowHeight + 14 + grain * 8, x + plankWidth - 10, row * rowHeight + 8 + grain * 10);
          ctx.stroke();
        }
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1.25, 1.1);
  return texture;
}

const exterior = {
  sunset: {label:'夕阳', sky:0xd3deed, ground:0x887869, ambient:.56, sun:0xffb76e, direct:3.45, direction:[19,5.52,33], fill:0xe7dfe0, intensity:.82, bounce:0xe2aa78, reflection:.21},
  snow: {phase:1, originalNight:true, moon:1, label:'月光', sky:0xa6bdeb, ground:0x424454, ambient:.32, sun:0xb3c9ff, direct:.43, direction:[10,14,33], fill:0xc0d9ff, intensity:.51, bounce:0xb2c2dc, reflection:.14},
  canal: {phase:.58, tint:[1.12,1.02,.97], label:'暮光', sky:0xbac1e3, ground:0x80615b, ambient:.47, sun:0xffcba5, direct:.68, direction:[17,9,30], fill:0xf4ccbe, intensity:.73, bounce:0xd7aca0, reflection:.23},
  lake: {phase:.94, moon:.95, tint:[.93,.99,1.08], label:'月光', sky:0xacbfde, ground:0x4d4850, ambient:.37, sun:0xffe4b6, direct:.56, direction:[-5.0,10.4,32], fill:0xb8cede, intensity:.54, bounce:0x949cae, reflection:.18},
  river: {daylight:1, tint:[.88,1.05,.99], label:'天光', sky:0xe0ebed, ground:0x93917c, ambient:.86, sun:0xffedce, direct:.85, direction:[12,24,32], fill:0xe6e8d9, intensity:1.18, bounce:0xf0dfc5, reflection:.35},
  fireworks: {phase:1, tint:[.94,1.02,1.11], label:'夜色', sky:0xbac6e7, ground:0x63545d, ambient:.46, sun:0xffdbac, direct:.40, direction:[-8,15,34], fill:0xa8bee9, intensity:.65, bounce:0xcb9f94, reflection:.19},
  stars: {phase:1, stars:1, tint:[.97,.96,1.13], label:'夜色', sky:0x9eafd9, ground:0x615575, ambient:.48, sun:0xc1cffa, direct:.31, direction:[8,18,34], fill:0xaabbec, intensity:.61, bounce:0xb9a7d7, reflection:.18},
  frost: {daylight:1, tint:[.94,1.00,1.07], label:'天光', sky:0xc9ddeb, ground:0x968b80, ambient:.68, sun:0xffd3a5, direct:.91, direction:[12,18,32], fill:0xe1e2e9, intensity:1.02, bounce:0xefcb9d, reflection:.29},
  ridges: {daylight:1, tint:[1.12,1.01,.92], label:'天光', sky:0xd7e3eb, ground:0x908273, ambient:.61, sun:0xffcd97, direct:1.49, direction:[-19,15,35], fill:0xe6e3e7, intensity:.93, bounce:0xf1c088, reflection:.28},
  lanterns: {phase:.79, tint:[.96,1.00,1.15], label:'暮光', sky:0x9bbaf2, ground:0x6c544c, ambient:.44, sun:0xffcb86, direct:.19, direction:[-13,12,31], fill:0xa1c1fb, intensity:.68, bounce:0xd59a6a, reflection:.20, night:true},
  regatta: {daylight:.96, tint:[1.10,1.03,.91], label:'晨光', sky:0xd7e8df, ground:0x8e997d, ambient:.71, sun:0xffd695, direct:1.12, direction:[20,12,34], fill:0xd8e7e0, intensity:.94, bounce:0xeed2a1, reflection:.26},
  blueHour: {phase:.87, tint:[1.04,.99,1.14], label:'暮光', sky:0xabbcf7, ground:0x56546d, ambient:.46, sun:0xffc39b, direct:.16, direction:[7,9,35], fill:0xadc0fc, intensity:.71, bounce:0xb8b7db, reflection:.19, night:true, snowCover:true}
};
const festivalExterior = {christmas:'snow',spring:'canal',lantern:'lanterns',newyear:'fireworks',midautumn:'lake',qixi:'stars',qingming:'river',dragonboat:'regatta',lidong:'frost',dongzhi:'blueHour',national:'ridges'};

function buildRoom(scene, skyLight, windowQuality, theme) {
  const room = new THREE.Group(), davidRoom = new THREE.Group();
  room.name='Lynn';
  davidRoom.name='David';
  davidRoom.position.x=davidRoomX;
  scene.add(room,davidRoom);
  const plaster = plasterTexture();
  const textureLoader = new THREE.TextureLoader();
  const floorDiffuse = textureLoader.load('assets/textures/wood_floor/wood_floor_diff_1k.jpg',undefined,undefined,() => {
    wood.map=woodTexture();wood.needsUpdate=true;
  });
  const floorNormal = textureLoader.load('assets/textures/wood_floor/wood_floor_nor_gl_1k.jpg',undefined,undefined,() => {
    wood.normalMap=null;wood.needsUpdate=true;
  });
  const floorArm = textureLoader.load('assets/textures/wood_floor/wood_floor_arm_1k.jpg',undefined,undefined,() => {
    wood.aoMap=null;wood.needsUpdate=true;
  });
  floorDiffuse.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [floorDiffuse,floorNormal,floorArm]) {
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(6,4);
    texture.anisotropy=8;
  }
  const wall = material(0xffffff, {map:plaster, roughness: .88, bumpMap:plaster, bumpScale:.008});
  const side = material(0xffffff, {map:plaster, roughness: .9, bumpMap:plaster, bumpScale:.008});
  const wood = new THREE.MeshPhysicalMaterial({
    color:0xeee7df, map:floorDiffuse, normalMap:floorNormal, aoMap:floorArm,
    aoMapIntensity:.45, roughness:.76, specularIntensity:.26
  });
  wood.normalScale.set(.40,.40);
  const trim = material(0xe4dcd3, {roughness: .7});
  const gold = material(COLORS.gold, {roughness: .26, metalness: .42});

  buildConnectedStructure(room,davidRoom,scene,{box,wood,wall,side,trim,material,canvasTexture,addMesh});
  box(room, [14, .38, .14], trim, [0, .32, -4.45]);
  trimFrame(room, -4.55, 3.2, 3.2, 4.05, -4.48, trim);
  trimFrame(room, -.65, 3.2, 3.9, 4.05, -4.48, trim);
  trimFrame(room, 4.35, 3.2, 3.45, 4.05, -4.48, trim);

  const valley = makeValleyTiles(textureLoader,theme,windowQuality);
  const harborFlashes = skyLight===exterior.fireworks ? [new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4()] : null;
  const duskPhase = {value:skyLight.phase || 0};
  const valleyMask = valleyTerrain(canvasTexture);
  const initialSun = duskSun(duskPhase.value);
  const showMoon=skyLight===exterior.lake || skyLight===exterior.sunset;
  const moonMap=showMoon ? textureLoader.load('assets/room/photo-valley/moon.webp') : null;
  if (moonMap) moonMap.colorSpace=THREE.SRGBColorSpace;
  const valleySun = {value:new THREE.Vector2(initialSun.azimuth,initialSun.elevation)};
  // The sphere only supplies view directions. Sample both photographic
  // surfaces per pixel, so no triangle can shear across the treeline.
  const landscape=new THREE.SphereGeometry(64,64,32);
  const sky = addMesh(room, landscape, new THREE.ShaderMaterial({
    uniforms:{
      ...valley.uniforms, harborFlashes:{value:harborFlashes},
      skyTime:duskPhase, valleyMask:{value:valleyMask}, valleySun,
      movingSun:{value:skyLight===exterior.sunset ? 1 : 0},
      moonMap:{value:moonMap}, moonFixed:{value:skyLight===exterior.lake ? 1 : 0},
      moonAngles:{value:new THREE.Vector3(-.155,.293,skyLight===exterior.lake ? .0185 : .012)},
      nightStars:{value:skyLight===exterior.stars ? .7 : 0}
    }, defines:{...(harborFlashes ? {VALLEY_FLASH:1} : {}),...(valley.enabled ? {VALLEY_UHD:1} : {}),...(showMoon ? {VALLEY_MOON:1} : {})},
    side:THREE.BackSide, depthWrite:true,
    vertexShader:`varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * vec4(mat3(viewMatrix)*position,1.);
        gl_Position.z = gl_Position.w*.99998;
      }`,
    fragmentShader:`varying vec3 direction;
      uniform sampler2D valleyMask;
      uniform float skyTime, movingSun, nightStars;
      uniform vec2 valleySun;
      #ifdef VALLEY_MOON
      uniform vec3 moonAngles;
      uniform sampler2D moonMap;
      uniform float moonFixed;
      #endif
      ${valleyTilesShader}
      ${valleyProjection}
      #ifdef VALLEY_FLASH
      uniform vec4 harborFlashes[3];
      #endif
      float houseTiming(vec2 uv) {
        vec2 cell=floor(uv*vec2(174.,220.));
        return fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
      }
      void main() {
        vec3 ray = normalize(direction);
        vec2 farUV=valleyUV(ray);
        vec2 uv=terrainUV(ray,cameraPosition-vec3(${captureX},${standingEye},0.),farUV);
        float land=texture2D(valleyMask,farUV).r;
        vec2 p=valleyTileUV(uv);
        vec2 dx=dFdx(p),dy=dFdy(p);
        float phase=movingSun*smoothstep(.06,1.,skyTime);
        vec3 sky=valleyPhoto(p,phase,dx,dy);
        if(movingSun>.5 && valleyAfterReady>.5 && land>.5 && phase>.01 && phase<.99) {
          vec3 late = textureGrad(valleyAfter,p,dx,dy).rgb;
          float warm = smoothstep(.02,.12,late.r-max(late.g,late.b));
          float t=houseTiming(uv);
          float appear=smoothstep(.38+t*.17,.73+t*.21,skyTime);
          sky += late*warm*(appear-phase)*.65;
        }
        vec3 haze=valleyHaze*mix(.22,.52,1.0-land);
        float distanceHaze = smoothstep(.18,.53,uv.y)*land;
        sky=mix(sky,haze,valleyHazeAmount*(.25+.62*distanceHaze+.19*(1.0-land)));
        vec2 angles=vec2(atan(ray.x,ray.z),asin(clamp(ray.y,-1.0,1.0)));
        float dist=length((angles-valleySun)*vec2(cos(valleySun.y),1.0));
        float solar=movingSun*(1.0-smoothstep(.62,.79,skyTime))*(1.0-land);
        sky += vec3(1.0,.43,.15)*exp(-dist*22.0)*solar*.11;
        sky=mix(sky,vec3(1.0,.83,.58),(1.0-smoothstep(.011,.013,dist))*solar);
        #ifdef VALLEY_MOON
        vec2 m=(angles-moonAngles.xy)*vec2(cos(moonAngles.y),1.0)/moonAngles.z;
        float radius=length(m);
        float moonLight=max(moonFixed,smoothstep(.74,1.0,skyTime))*(1.0-land);
        float airy=exp(-radius*1.15)*moonLight;
        sky += mix(vec3(.52,.66,.87),vec3(.94,.70,.46),moonFixed*.55)*airy*.15;
        if (radius<1.0) {
          vec3 face=texture2D(moonMap,clamp(.5+m*.42,0.0,1.0)).rgb;
          vec3 glow=mix(vec3(.81,.89,1.0),vec3(1.0,.91,.75),moonFixed);
          sky=mix(sky,glow*mix(.52,1.0,face.r),(1.0-smoothstep(.91,1.0,radius))*moonLight);
        }
        #endif
        if (nightStars>0.0) {
          vec2 grid=p*vec2(345.,198.);
          float hash=houseTiming(floor(grid)/43.0);
          vec2 spot=vec2(fract(hash*31.73),fract(hash*71.96))*.72+.14;
          float sparkle=(1.0-smoothstep(.024,.090,length(fract(grid)-spot)))*step(.991,hash);
          sky+=sparkle*vec3(.55,.64,.81)*nightStars*(1.0-land)*smoothstep(.54,.70,uv.y);
        }
        #ifdef VALLEY_FLASH
        for(int i=0;i<3;i++){
          vec4 flash=harborFlashes[i];
          vec2 delta=(uv-vec2(flash.x,.405))*vec2(18.,10.);
          sky += vec3(1.,.54+.24*flash.w,.41)*flash.y*land*exp(-dot(delta,delta))*.055;
        }
        #endif
        gl_FragColor=vec4(max(sky,0.0),1.0);
        #include <colorspace_fragment>
      }`
  }));
  sky.frustumCulled = false;
  sky.renderOrder = -5;
  sky.castShadow = sky.receiveShadow = false;
  const lynnWindow=buildWindowWall(room,skyLight);
  const {glass:windowGlass}=lynnWindow;
  const davidWindow=buildWindowWall(davidRoom,skyLight,windowGlass);
  const balconyDoors={lynn:lynnWindow.door,david:davidWindow.door};
  return {room,davidRoom,valley,harborFlashes,valleyMask,duskPhase,valleySun,moonMap,windowGlass,balconyDoors};
}

function buildWindowWall(room,skyLight,sharedGlass) {
  const balcony=new THREE.Group();
  balcony.position.y=.105;
  room.add(balcony);
  buildBalcony(balcony, skyLight===exterior.snow || skyLight.snowCover);
  const glass = sharedGlass || new THREE.MeshPhysicalMaterial({
    color:0xf4f7fa,transparent:true,opacity:.026,roughness:.095,ior:1.46,
    envMapIntensity:.29,specularIntensity:.62,depthWrite:false,side:THREE.DoubleSide
  });
  glass.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float viewAngle = clamp(abs(dot(normalize(vViewPosition), normal)),0.0,1.0);
      diffuseColor.a *= 0.67 + 2.65 * pow(1.0-viewAngle,4.0);
      #include <opaque_fragment>
    `);
  };
  const mullion=material(0x34302e,{roughness:.34,metalness:.5});
  function pane(parent,width,height,x,y,z=4.61) {
    const mesh=addMesh(parent,new THREE.PlaneGeometry(width,height),glass,[x,y,z],[0,Math.PI,0]);
    mesh.castShadow=mesh.receiveShadow=false;
  }
  pane(room,13.7,3.73,0,4.505);
  for(const [left,right] of [[-6.85,doorLeft],[doorRight,6.85]]) {
    const width=right-left,x=(right+left)/2;
    pane(room,width,2.59,x,1.32);
    box(room,[width,.116,.30],mullion,[x,.057,4.45]).castShadow=false;
  }
  const door=new THREE.Group();
  room.add(door);
  const width=doorRight-doorLeft, center=(doorLeft+doorRight)/2;
  pane(door,width-.09,2.52,center,1.35,4.56);
  for(const x of [doorLeft+.051,doorRight-.051]) {
    box(door,[.082,2.6,.087],mullion,[x,1.33,4.55]);
  }
  for (const y of [.065,2.61]) box(door,[width-.045,.079,.105],mullion,[center,y,4.55]);
  const hardware=material(0x9e8256,{metalness:.61,roughness:.39});
  const stileX=doorRight-.051;
  for(const face of [-1,1]) {
    box(door,[.052,.29,.012],hardware,[stileX,1.075,4.55+face*.047]);
    for(const y of [.96,1.19]) cylinder(door,.016,.016,.066,hardware,[stileX,y,4.55+face*.083],20,[Math.PI/2,0,0]);
    cylinder(door,.016,.016,.258,hardware,[stileX,1.075,4.55+face*.115],24);
  }
  for(const x of [-6.82,-3.42,3.42,6.82]) box(room,[.085,6.35,.10],mullion,[x,3.18,4.55]);
  box(room,[.085,3.78,.10],mullion,[0,4.49,4.55]);
  for(const [y,height] of [[2.64,.126],[6.35,.085]]) box(room,[13.75,height,.125],mullion,[0,y,4.55]);
  box(room,[width,.028,.26],mullion,[center,.015,4.51]).castShadow=false;
  for(const z of [4.48,4.56]) box(room,[width,.014,.014],hardware,[center,.033,z]).castShadow=false;
  return {glass,door};
}

function buildBalcony(room, snowy) {
  const width=14.8, back=4.64, front=7.22;
  const depth=front-back, middle=(front+back)/2;
  const stone = material(0x9a8b80,{roughness:.91});
  const bronze = material(0x48403a,{roughness:.48,metalness:.46});
  box(room,[width,.18,depth],stone,[0,-.195,middle]);
  box(room,[width,.075,.18],stone,[0,-.093,front]);
  addTerracePavers(room,width,back,depth);
  const anchor=material(0x6c5d52,{metalness:.53,roughness:.52});
  const post = (x,z) => {
    box(room,[.054,1.08,.054],bronze,[x,.452,z]);
    box(room,[.13,.016,.13],anchor,[x,-.081,z]).castShadow=false;
  };
  const right=width/2-.12;
  const railZ=front-.085;
  for(let i=0;i<=10;i++) post(right*(i/5-1),railZ);
  for(const x of [-right,right]) post(x,middle);
  for(const [y,height,depthOfRail] of [[.98,.055,.077],[.59,.03,.033],[.25,.03,.033]]) {
    box(room,[2*right,height,depthOfRail],bronze,[0,y,railZ]);
    for(const x of [-right,right]) {
      box(room,[depthOfRail,height,railZ-back],bronze,[x,y,(railZ+back)/2]);
    }
  }
  if (snowy) {
    const snow=material(0xdee6ee,{roughness:.98});
    box(room,[width-.034,.034,depth-.028],snow,[0,-.057,middle]);
    box(room,[2*right,.018,.076],snow,[0,1.015,railZ]);
    for(const x of [-right,right]) {
      box(room,[.076,.018,railZ-back],snow,[x,1.015,(railZ+back)/2]);
    }
  }
}

function addTerracePavers(room,width,back,depth) {
  const grain=canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#d3cec6';ctx.fillRect(0,0,w,h);
    for(let i=0;i<2100;i++){
      const x=(12.71+i*79.257)%w,y=(2.71+i*195.43)%h;
      ctx.fillStyle=i%4 ? '#a69e902a' : '#fffdfa6b';
      ctx.fillRect(x,y,1+i%4,1+i%3);
    }
  });
  const limestone=material(0xfff7ee,{map:grain,bumpMap:grain,bumpScale:.016,roughness:.93});
  const columns=24, rows=5, tileWidth=width/columns, tileDepth=depth/rows;
  const pavers=new THREE.InstancedMesh(new THREE.BoxGeometry(tileWidth-.008,.03,tileDepth-.008),limestone,columns*rows);
  const palette=[0xe0d4c0,0xd9cdb9,0xddd2c3,0xd4c5b3,0xe1d9cb];
  const matrix=new THREE.Matrix4();
  for(let row=0;row<rows;row++) for(let col=0;col<columns;col++){
    const index=row*columns+col;
    const x=(col+.5)*tileWidth-width/2, z=back+(row+.5)*tileDepth;
    pavers.setMatrixAt(index,matrix.makeTranslation(x,-.092,z));
    pavers.setColorAt(index,new THREE.Color(palette[(index*3+row)%palette.length]));
  }
  pavers.receiveShadow=true;
  room.add(pavers);
}

function addFloorContacts(room) {
  const footprints = [
    ['rug',.22,.07], ['real-sofa',.20,.12], ['bed',.20,.12],
    ['reading-cart',.18,.13], ['real-plant',.27,.10], ['plant',.26,.10],
    ['real-coffee-table',.16,.10], ['lamp',.21,.07], ['window-bench',.15,.075]
  ];
  const contactMap = canvasTexture(96,96,(ctx,w,h) => {
    const falloff = ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2);
    falloff.addColorStop(0,'#fff');
    falloff.addColorStop(.62,'#fff');
    falloff.addColorStop(.84,'rgba(255,255,255,.36)');
    falloff.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle = falloff; ctx.fillRect(0,0,w,h);
  });
  const bounds = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  let order = 0;
  for (const [name,strength,spill] of footprints) {
    const object = room.getObjectByName(name);
    if (!object) continue;
    bounds.setFromObject(object,true);
    bounds.getSize(size); bounds.getCenter(center);
    const ground = new THREE.MeshBasicMaterial({
      color:0x353039, map:contactMap, opacity:strength, transparent:true,
      depthWrite:false, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1
    });
    const contact = addMesh(room,new THREE.PlaneGeometry(size.x + spill * 2,size.z + spill * 2),
      ground,[center.x,.0035 + order++ * .0003,center.z],[-Math.PI/2,0,0]);
    contact.castShadow = contact.receiveShadow = false;
  }
  if (!order) contactMap.dispose();
}

function buildSunsetAtmosphere(parent) {
  const particles = 24;
  const positions = new Float32Array(particles * 3);
  for (let index=0; index<particles; index+=1) {
    positions[index*3]=-5.8+Math.random()*11.6;
    positions[index*3+1]=.35+Math.random()*5.7;
    positions[index*3+2]=-3.9+Math.random()*7.9;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const dustTexture = canvasTexture(64,64,(ctx,width,height) => {
    const mote=ctx.createRadialGradient(width/2,height/2,0,width/2,height/2,width/2);
    mote.addColorStop(0,'rgba(255,255,255,1)'); mote.addColorStop(.35,'rgba(255,227,184,.75)'); mote.addColorStop(1,'rgba(255,213,160,0)');
    ctx.fillStyle=mote; ctx.fillRect(0,0,width,height);
  });
  const dustMaterial = new THREE.PointsMaterial({color:0xffdfb2,map:dustTexture,size:.012,transparent:true,opacity:.12,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true});
  const dust = new THREE.Points(dustGeometry,dustMaterial);
  dust.name='sunset-dust'; parent.add(dust);
  return dust;
}

function buildOutdoorSnow(room, mobile, soft) {
  const count=soft ? (mobile ? 210 : 365) : (mobile ? 540 : 1050);
  const positions=new Float32Array(count*3);
  const seeds=new Float32Array(count);
  for(let i=0;i<count;i++) {
    positions[i*3]=-16+Math.random()*32;
    positions[i*3+1]=Math.random()*12;
    positions[i*3+2]=4.84+Math.random()*15;
    seeds[i]=Math.random();
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geo.setAttribute('seed',new THREE.BufferAttribute(seeds,1));
  const mat=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:{elapsed:{value:0},pixels:{value:600},strength:{value:soft ? .63 : 1}},
    vertexShader:`attribute float seed;
      uniform float elapsed,pixels,strength;
      varying float opacity;
      void main(){
        vec3 p=position;
        p.y=mod(p.y-elapsed*strength*(.39+seed*.72),12.0)-.12;
        p.x+=.45*sin(seed*116.0+elapsed*.46+p.y*.47);
        vec4 eye=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*eye;
        gl_PointSize=clamp(pixels*strength*(.009+seed*.020)/max(1.0,-eye.z),1.25,6.0);
        opacity=strength*(.32+.45*seed)*smoothstep(-.12,.14,p.y);
      }`,
    fragmentShader:`varying float opacity;
      void main(){vec2 q=gl_PointCoord*2.0-1.0;
        gl_FragColor=vec4(.86,.91,1.0,opacity*(1.0-smoothstep(.14,1.0,length(q))));
        #include <colorspace_fragment>
      }`
  });
  const snow=new THREE.Points(geo,mat);snow.frustumCulled=false;room.add(snow);
  return mat.uniforms;
}

function buildWindow(parent) {
  const group = new THREE.Group();
  group.name = 'window';
  group.position.set(3.6, 3.65, -2.73);
  parent.add(group);
  const frame = material(COLORS.cream, {roughness: .55});
  const pane = material(COLORS.night, {roughness: .2, emissive: COLORS.night, emissiveIntensity: .55});
  const curtain = material(COLORS.lavender, {roughness: .98});
  box(group, [2.55, 3.05, .12], frame, [0, 0, -.02]);
  box(group, [2.18, 2.66, .08], pane, [0, 0, .08]);
  box(group, [.09, 2.7, .12], frame, [0, 0, .17]);
  box(group, [2.22, .09, .12], frame, [0, 0, .18]);
  const moon = sphere(group, .25, material(0xffe5a5, {emissive: 0xffd278, emissiveIntensity: 1.2}), [.42, .56, .25]);
  moon.scale.z = .35;
  for (const x of [-1.25, 1.25]) {
    const side = cylinder(group, .34, .52, 2.85, curtain, [x, .15, .42], 24, [0, 0, x < 0 ? -.13 : .13]);
    side.scale.z = .62;
    cylinder(group, .42, .42, .12, material(COLORS.gold, {metalness: .18}), [x, -.1, .47], 24, [Math.PI / 2, 0, 0]);
  }
  box(group, [2.95, .11, .11], material(COLORS.gold, {metalness: .18}), [0, 1.68, .43]);
  return group;
}

function buildShelf(parent) {
  const group = new THREE.Group();
  group.name = 'shelf';
  group.position.set(-3.65, 3.85, -2.7);
  parent.add(group);
  const frame = material(COLORS.lavenderDark, {roughness: .74});
  const shelf = material(COLORS.lavender, {roughness: .72});
  box(group, [2.35, 2.05, .18], frame, [0, 0, 0]);
  box(group, [2.05, 1.76, .2], material(0xd7a6bc), [0, 0, .13]);
  for (const y of [-.62, .02, .66]) box(group, [2.15, .12, .5], shelf, [0, y, .34]);
  const bookColors = [0xe7a3b8, 0xa98bc9, 0xe4bb64, 0x7f76b1, 0x6eae91];
  let x = -.78;
  for (let i = 0; i < 8; i += 1) {
    const h = .42 + (i % 3) * .07;
    box(group, [.17, h, .25], material(bookColors[i % bookColors.length]), [x, -.32 + h / 2, .55], [0, 0, (i % 2 ? -.03 : .04)]);
    x += .22;
  }
  sphere(group, .18, material(COLORS.cream), [.52, .5, .55], [1, .7, .7]);
  return group;
}

function addRugName(rug,name,ink,height) {
  const lettering=canvasTexture(1024,384,(ctx,w,h)=>{
    ctx.font='italic 600 258px Georgia, serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.lineWidth=4;ctx.strokeStyle='#392931';
    ctx.strokeText(name,w/2+3,h*.51+4);
    ctx.fillStyle=ink;ctx.fillText(name,w/2,h*.51);
  });
  const fabric=new THREE.MeshStandardMaterial({
    map:lettering,transparent:true,alphaTest:.07,depthWrite:false,roughness:.99,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
  });
  const letters=addMesh(rug,new THREE.PlaneGeometry(2.47,.93),fabric,[0,height,.43],[-Math.PI/2,0,0]);
  letters.rotateZ(Math.PI);
  letters.castShadow=false;
}

function buildEverydayRug(parent) {
  const group = new THREE.Group();
  group.name='rug';
  group.position.set(.02,.003,-.24);
  group.rotation.y=-.055;
  parent.add(group);
  const radius=2.43;
  const rugRatio=.65;
  const woolMap=new THREE.TextureLoader().load('assets/room/everyday-heather-rug.webp');
  woolMap.colorSpace=THREE.SRGBColorSpace;
  woolMap.wrapS=woolMap.wrapT=THREE.RepeatWrapping;
  woolMap.repeat.set(4.6,3.1);
  woolMap.anisotropy=8;
  const fabric=new THREE.MeshPhysicalMaterial({
    color:0xd6bed6,map:woolMap,bumpMap:woolMap,bumpScale:.008,
    roughness:.96,specularIntensity:.19,sheen:.30,sheenColor:0xc7b6cf,sheenRoughness:.87
  });
  // A low rounded lip keeps the textile visibly in contact with the boards.
  const seam=[ [0,.037],[radius-.145,.039],[radius-.051,.033],[radius-.025,.024],
    [radius,.016],[radius-.006,.005],[radius-.020,0],[0,0] ];
  const geo=new THREE.LatheGeometry(seam.reverse().map(([x,y])=>new THREE.Vector2(x,y)),124);
  const positions=geo.attributes.position, uv=geo.attributes.uv;
  for(let i=0;i<positions.count;i++){
    uv.setXY(i,.5+positions.getX(i)/(2*radius),.5+positions.getZ(i)/(2*radius));
    positions.setZ(i,positions.getZ(i)*rugRatio);
  }
  geo.computeVertexNormals();
  addMesh(group,geo,fabric).castShadow=false;
  const binding=material(0x6f526e,{roughness:.96});
  const edging=[];
  for(let i=0;i<124;i++){
    const a=i*2*Math.PI/124;
    edging.push(new THREE.Vector3((radius-.048)*Math.cos(a),.037,(radius-.048)*rugRatio*Math.sin(a)));
  }
  addMesh(group,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edging,true),136,.008,6,true),binding).castShadow=false;
  const stitchCount=232;
  const stitches=new THREE.InstancedMesh(new THREE.BoxGeometry(.018,.006,.007),material(0xc4a9b9,{roughness:.96}),stitchCount);
  const thread=new THREE.Object3D();
  for(let i=0;i<stitchCount;i++){
    const a=i*2*Math.PI/stitchCount;
    thread.position.set((radius-.072)*Math.cos(a),.036,(radius-.072)*rugRatio*Math.sin(a));
    thread.rotation.y=-Math.atan2(Math.sin(a)*rugRatio,Math.cos(a))+.36;
    thread.updateMatrix();
    stitches.setMatrixAt(i,thread.matrix);
  }
  stitches.receiveShadow=true;
  group.add(stitches);
  addRugName(group,'Lynn','#fff0e6',.041);
}

function buildRug(parent, finish, owner='Lynn') {
  const group = new THREE.Group();
  group.name = 'rug';
  group.position.set(0, .016, -.18);
  parent.add(group);
  const loader = new THREE.TextureLoader();
  const diffuse = loader.load('assets/textures/poly_wool_herringbone/poly_wool_herringbone_diff_1k.jpg');
  const normal = loader.load('assets/textures/poly_wool_herringbone/poly_wool_herringbone_nor_gl_1k.jpg');
  const arm = loader.load('assets/textures/poly_wool_herringbone/poly_wool_herringbone_arm_1k.jpg');
  diffuse.colorSpace=THREE.SRGBColorSpace;
  for (const texture of [diffuse,normal,arm]) {
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.repeat.set(4.5,2.4);
    texture.anisotropy=8;
  }
  const rim = cylinder(group, 2.48, 2.48, .03, material(finish.trim, {roughness:.96}), [0,0,0], 96);
  rim.scale.set(1.02,1,.54);
  const wool = new THREE.MeshPhysicalMaterial({
    color:finish.rug, map:diffuse, normalMap:normal, aoMap:arm, aoMapIntensity:.52,
    roughness:.97, specularIntensity:.13, sheen:.25, sheenColor:finish.rug, sheenRoughness:.86
  });
  wool.normalScale.set(.49,.49);
  const rug = addMesh(group,new THREE.CircleGeometry(2.37,96),wool,[0,.023,0],[-Math.PI/2,0,0],[1.02,.54,1]);
  rug.geometry.setAttribute('uv2',rug.geometry.attributes.uv.clone());
  rug.castShadow=false;
  const stitch=material(new THREE.Color(finish.trim).lerp(new THREE.Color(finish.rug),.62),{roughness:.97});
  addMesh(group,new THREE.TorusGeometry(2.33,.008,6,96),stitch,[0,.024,0],[-Math.PI/2,0,0],[1.02,.54,1]).castShadow=false;
  addRugName(group,owner,'#f5e7ce',.026);
  return group;
}

function buildBed(parent) {
  const group = new THREE.Group();
  group.name = 'bed';
  group.position.set(-4.55, .16, .7);
  group.rotation.y = .12;
  parent.add(group);
  const velvet = material(0x9b73b7, {roughness:.82});
  const velvetLight = material(0xc59ac8, {roughness:.9});
  const gold = material(0xd7aa62, {roughness:.28,metalness:.42});
  const seat = addMesh(group,new THREE.CapsuleGeometry(.42,1.75,10,24),velvet,[0,.55,.08],[0,0,Math.PI/2],[1,1,.82]);
  seat.castShadow=true;
  const back = addMesh(group,new THREE.CapsuleGeometry(.38,1.8,10,24),velvetLight,[0,1.18,-.55],[0,0,Math.PI/2],[1,1,.55]);
  for (const x of [-1.16,1.16]) sphere(group,.43,velvet,[x,.66,.02],[.88,1.15,.92]);
  sphere(group,.42,material(COLORS.cream,{roughness:.98}),[-.46,.91,-.05],[1.35,.58,.72]);
  for (const x of [-.94,.94]) for (const z of [-.38,.42]) cylinder(group,.055,.075,.42,gold,[x,.17,z],18,[0,0,x<0?-.06:.06]);
  for (const x of [-.66,0,.66]) sphere(group,.035,gold,[x,1.22,-.23]);
  return group;
}

function buildLamp(parent, scene) {
  const group = new THREE.Group();
  group.name = 'lamp';
  group.position.set(-5.92, 0, 2.42);
  parent.add(group);
  const gold = material(COLORS.gold, {roughness:.24,metalness:.48});
  cylinder(group,.38,.48,.13,gold,[0,.08,0],40);
  addMesh(group,new THREE.TorusGeometry(.34,.045,12,40),gold,[0,.16,0],[Math.PI/2,0,0]);
  cylinder(group,.045,.065,1.55,gold,[0,.91,0],24);
  sphere(group,.09,gold,[0,1.72,0]);
  const linen = canvasTexture(192,192,(ctx,w,h) => {
    ctx.fillStyle = '#e7cead'; ctx.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=3){
      ctx.fillStyle = x%9 ? '#9e775527' : '#fff2ce72';
      ctx.fillRect(x,0,1,h);
    }
    for(let y=1;y<h;y+=3){
      ctx.fillStyle = y%7 ? '#fff4db46' : '#98755545';
      ctx.fillRect(0,y,w,1);
    }
    const shadeGlow=ctx.createLinearGradient(0,0,0,h);
    shadeGlow.addColorStop(0,'#79593630');
    shadeGlow.addColorStop(.54,'#fff3d04a');
    shadeGlow.addColorStop(1,'#98745130');
    ctx.fillStyle=shadeGlow;ctx.fillRect(0,0,w,h);
  });
  const shadeMaterial=material(0xfff3e0,{
    map:linen,bumpMap:linen,bumpScale:.013,emissive:0xffcf99,emissiveIntensity:1.06,roughness:.84,side:THREE.DoubleSide
  });
  shadeMaterial.emissiveMap=linen;
  const shade = addMesh(group,new THREE.CylinderGeometry(.269,.495,.53,56,1,true),shadeMaterial,[0,1.64,0]);
  shade.castShadow=false;
  for (const [y,r] of [[1.378,.49],[1.903,.269]]) {
    const edge=addMesh(group,new THREE.TorusGeometry(r,.012,9,56),gold,[0,y,0],[Math.PI/2,0,0]);
    edge.castShadow=false;
  }
  const topCap=addMesh(group,new THREE.CircleGeometry(.267,48),material(0xd6bb94,{roughness:.91,side:THREE.DoubleSide}),[0,1.894,0],[-Math.PI/2,0,0]);
  topCap.castShadow=false;
  const scatter = new THREE.PointLight(0xffc58f,6.1,4.6,2);
  scatter.position.set(-5.92,1.64,2.42);
  scene.add(scatter);
  // Diffuse transmission through the shade and the broad opening beneath it.
  const bounce = new THREE.RectAreaLight(0xffc88e,2.8,.74,.46);
  bounce.position.set(-6.09,1.60,2.42);
  bounce.lookAt(-6.87,1.52,2.42);
  const taskLight = new THREE.SpotLight(0xffd1a0,12.3,3.75,.77,.88,2);
  taskLight.position.set(-5.89,1.374,2.41);
  taskLight.target.position.set(-5.32,.14,1.94);
  scene.add(bounce,taskLight,taskLight.target);
  return {label:'沙发落地灯',lights:[scatter,bounce,taskLight],material:shadeMaterial,onIntensity:1.06,fixtures:[shade]};

}

function buildPlant(parent) {
  const group = new THREE.Group();
  group.name = 'plant';
  group.position.set(5.15, 0, 2.35);
  parent.add(group);
  const pot=addMesh(group,new THREE.LatheGeometry([new THREE.Vector2(.28,0),new THREE.Vector2(.38,.08),new THREE.Vector2(.45,.48),new THREE.Vector2(.37,.62),new THREE.Vector2(.3,.65)],32),material(0xc87894,{roughness:.62}),[0,0,0]);
  pot.castShadow=true;
  cylinder(group,.31,.31,.035,material(0x4e352f,{roughness:1}),[0,.64,0],32);
  const stem = material(0x3f684f, {roughness:.84});
  const leafA = material(0x4f8f70, {roughness:.74, side:THREE.DoubleSide});
  const leafB = material(0x75a988, {roughness:.78, side:THREE.DoubleSide});
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0,-.38);
  leafShape.bezierCurveTo(.28,-.19,.31,.17,0,.42);
  leafShape.bezierCurveTo(-.31,.17,-.28,-.19,0,-.38);
  const leafGeometry = new THREE.ShapeGeometry(leafShape, 18);
  for (let i = 0; i < 11; i += 1) {
    const angle = (i / 11) * Math.PI * 2;
    const h = .72 + (i % 4) * .18;
    cylinder(group,.018,.032,h,stem,[Math.cos(angle)*.1,.61+h/2,Math.sin(angle)*.1],10,[Math.sin(angle)*.22,0,Math.cos(angle)*.22]);
    const leafMesh=addMesh(group,leafGeometry,i%2?leafA:leafB,[Math.cos(angle)*(.3+(i%3)*.07),.98+(i%4)*.2,Math.sin(angle)*(.26+(i%2)*.08)],[Math.PI/2.45,-angle,(i%2?-.18:.18)],[.72+(i%3)*.08,.9+(i%2)*.14,.9]);
    leafMesh.castShadow=true;
    const vein = cylinder(group,.009,.012,.48,stem,[Math.cos(angle)*(.3+(i%3)*.07),.98+(i%4)*.2,Math.sin(angle)*(.26+(i%2)*.08)+.01],8,[Math.PI/2.45,-angle,0]);
    vein.castShadow=false;
  }
  return group;
}

function buildOutfit(parent) {
  const group = new THREE.Group();
  group.name = 'outfit';
  group.position.set(3.72, .05, 2.08);
  parent.add(group);
  const wood=material(0x6d405b,{roughness:.48});
  const gold=material(COLORS.gold,{roughness:.25,metalness:.42});
  for(const x of [-.56,.56]) cylinder(group,.045,.065,1.9,wood,[x,.96,0],18,[0,0,x<0?-.11:.11]);
  cylinder(group,.04,.055,1.75,wood,[0,.9,.34],18,[.14,0,0]);
  box(group,[1.35,.1,.12],gold,[0,.62,.03]);
  box(group,[1.35,1.02,.12],gold,[0,1.28,.02]);
  const artTexture=paintingTexture(8);
  const canvas=addMesh(group,new THREE.PlaneGeometry(1.15,.83),new THREE.MeshBasicMaterial({map:artTexture,toneMapped:false}),[0,1.28,.09]);
  canvas.castShadow=false;
  box(group,[1.42,.13,.5],material(COLORS.cream,{roughness:.72}),[0,.18,.08]);
  sphere(group,.09,gold,[0,.64,.12]);
  return group;
}

function buildSpotBeam(parent, spot, direction) {
  const length = 5.5;
  const beam = addMesh(parent,
    new THREE.CylinderGeometry(.11, Math.tan(spot.angle) * length, length, 40, 1, true),
    new THREE.ShaderMaterial({
      uniforms:{strength:{value:.12}, scatter:{value:new THREE.Color(0xffd2a0)}},
      vertexShader:`
        varying vec3 beamPoint;
        varying vec3 beamNormal;
        varying float beamDepth;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          beamPoint = world.xyz;
          beamNormal = normalize(mat3(modelMatrix) * normal);
          beamDepth = 1.0 - uv.y;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader:`
        uniform float strength;
        uniform vec3 scatter;
        varying vec3 beamPoint;
        varying vec3 beamNormal;
        varying float beamDepth;
        void main() {
          float facing = abs(dot(normalize(cameraPosition - beamPoint), normalize(beamNormal)));
          float edge = smoothstep(0.04, 0.7, facing);
          float falloff = smoothstep(0.008, 0.1, beamDepth) * (1.0 - smoothstep(0.45, 1.0, beamDepth));
          float insideRoom = smoothstep(-4.53, -4.34, beamPoint.z);
          gl_FragColor = vec4(scatter, strength * edge * falloff * insideRoom);
          #include <colorspace_fragment>
        }`,
      transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
    })
  );
  beam.position.copy(spot.position).addScaledVector(direction, length / 2);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0), direction);
  beam.castShadow = false;
  beam.receiveShadow = false;
  return beam;
}

function buildCeilingLights(parent, scene, mobile) {
  const fixtures = new THREE.Group();
  fixtures.name = 'ceiling-lights';
  parent.add(fixtures);
  const brass = material(0xc99a56, {roughness:.22, metalness:.58});
  const darkBrass = material(0x72506a, {roughness:.3, metalness:.42});
  const channels=[];

  [-3.75, 0, 3.75].forEach((x, index) => {
    const target = new THREE.Object3D();
    target.position.set(x, 3.45, -4.54);
    scene.add(target);
    const spot = new THREE.SpotLight(0xffd4a8, index === 1 ? 74 : 66, 10, .290, .68, 2);
    spot.position.set(x, 6.04, -1.22);
    spot.target = target;
    spot.castShadow = !mobile && index === 1;
    if (spot.castShadow) {
      spot.shadow.mapSize.set(1024,1024);
      spot.shadow.bias = -.00045;
      spot.shadow.normalBias = .025;
    }
    scene.add(spot);

    const direction = target.position.clone().sub(spot.position).normalize();
    const head = new THREE.Group();
    head.position.copy(spot.position);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0), direction);
    fixtures.add(head);
    cylinder(fixtures,.20,.20,.09,darkBrass,[x,6.6,-1.11],32);
    cylinder(fixtures,.05,.06,.42,brass,[x,6.36,-1.11],20);
    const lens = material(0xcbab84,{emissive:0xffbd72,emissiveIntensity:3.8,roughness:.28});
    cylinder(head,.17,.21,.43,darkBrass,[0,.23,0],32).castShadow=false;
    cylinder(head,.216,.216,.045,brass,[0,.032,0],32).castShadow=false;
    cylinder(head,.162,.162,.024,lens,[0,.005,0],32).castShadow=false;
    const beam = buildSpotBeam(fixtures, spot, direction);
    channels.push({label:['左射灯','中射灯','右射灯'][index],light:spot,material:lens,onIntensity:3.8,beam,fixtures:head.children});
  });
  return {fixtures,channels};
}

function buildMascot(parent, withCrown) {
  const group = new THREE.Group();
  group.name = 'mascot';
  group.position.set(0, .17, .92);
  parent.add(group);
  const purple = material(0xa985cf, {roughness: .92});
  const purpleDark = material(0x8060ab, {roughness: .94});
  const cream = material(0xf8e8e1, {roughness: .98});
  const ink = material(COLORS.ink, {roughness: .5});
  sphere(group, 1, purple, [0, 1.02, 0], [1.05, 1.08, .92]);
  sphere(group, .6, cream, [0, .76, .79], [1.02, .92, .28]);
  for (const x of [-.43, .43]) {
    const eye = sphere(group, .23, material(COLORS.white, {roughness: .34}), [x, 1.34, .79], [1, 1.12, .46]);
    eye.castShadow = false;
    sphere(group, .12, ink, [x, 1.34, .94], [1, 1.1, .4]).castShadow = false;
    sphere(group, .045, material(COLORS.white), [x - .035, 1.41, 1.01], [1, 1, .3]).castShadow = false;
    sphere(group, .18, material(0xed8daa), [x * 1.38, 1.02, .88], [1.15, .62, .34]);
  }
  for (const x of [-.86, .86]) sphere(group, .31, purpleDark, [x, .62, .18], [1, .85, .9]);
  for (const x of [-.48, .48]) sphere(group, .34, purpleDark, [x, .12, .12], [1.15, .55, 1]);
  for (const x of [-.58, .58]) sphere(group, .18, purple, [x, 1.92, -.05], [1, 1.35, .7]);

  const book = new THREE.Group();
  book.position.set(0, .6, 1.16);
  book.rotation.x = -.12;
  group.add(book);
  box(book, [.63, .72, .09], material(0xf2a5bd, {roughness: .8}), [-.31, 0, 0], [0, .12, 0]);
  box(book, [.63, .72, .09], material(0xf6b1c7, {roughness: .8}), [.31, 0, 0], [0, -.12, 0]);
  box(book, [.055, .75, .11], material(COLORS.gold), [0, 0, .02]);
  if (withCrown) {
    const crown = new THREE.Group();
    crown.position.set(0, 2.18, 0);
    group.add(crown);
    cylinder(crown, .42, .52, .22, material(COLORS.gold, {metalness: .24, roughness: .35}), [0, 0, 0], 32);
    for (const x of [-.34, 0, .34]) addMesh(crown, new THREE.ConeGeometry(.18, .48, 18), material(COLORS.gold, {metalness: .24, roughness: .35}), [x, .3 + (x === 0 ? .1 : 0), 0]);
  }
  group.userData.hitTargets = [];
  group.traverse(object => { if (object.isMesh) group.userData.hitTargets.push(object); });
  return group;
}

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function labelTexture(text) {
  return canvasTexture(768, 112, (ctx, width, height) => {
    const gradient=ctx.createLinearGradient(0,0,width,0);
    gradient.addColorStop(0,'#8d6a43'); gradient.addColorStop(.5,'#d3b47b'); gradient.addColorStop(1,'#8d6a43');
    ctx.fillStyle=gradient; ctx.fillRect(0,0,width,height);
    ctx.strokeStyle='#f4dfb2'; ctx.lineWidth=4; ctx.strokeRect(5,5,width-10,height-10);
    ctx.fillStyle = '#fff8e8'; ctx.shadowColor='#3c281f66'; ctx.shadowBlur=5; ctx.font = '600 30px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = String(text || '房间里的画').slice(0, 24);
    ctx.fillText(label, width / 2, height / 2, width - 48);
  });
}

function paintingTexture(index) {
  const palettes = [['#8263a6','#e8a7bd','#ffd79a'],['#574778','#a78bc8','#f5e7d7'],['#b46d8d','#e9b7c8','#745887']];
  return canvasTexture(720, 520, (ctx, width, height) => {
    const colors = palettes[index % palettes.length];
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors[0]); gradient.addColorStop(.55, colors[1]); gradient.addColorStop(1, colors[2]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = .78;
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 137 + index * 61) % width, y = (i * 83 + index * 47) % height;
      ctx.fillStyle = i % 3 ? '#fff2d5' : '#6f4d86';
      ctx.beginPath(); ctx.arc(x, y, 8 + (i % 4) * 7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = '#fff9ef'; ctx.font = '700 42px system-ui, sans-serif';
    ctx.fillText('星光习作 ' + String(index + 1).padStart(2, '0'), 38, height - 44);
  });
}

function photoTexture(photo, loadURL) {
  const texture = canvasTexture(1040, 751, (ctx, width, height) => {
    ctx.fillStyle = '#f6e9df'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#9b82a6'; ctx.font = '600 28px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('正在装裱照片…', width / 2, height / 2);
  });
  const image = new Image();
  image.onload = () => {
    const canvas = texture.image, ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f6e9df'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min((canvas.width - 20) / image.naturalWidth, (canvas.height - 20) / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    ctx.shadowColor = '#34232f55'; ctx.shadowBlur = 16;
    ctx.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    ctx.shadowColor = 'transparent';
    texture.needsUpdate = true;
  };
  const fail=()=>{
    const canvas=texture.image, ctx=canvas.getContext('2d');
    ctx.fillStyle='#f6e9df';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#9b82a6';ctx.font='600 28px system-ui, sans-serif';ctx.textAlign='center';
    ctx.fillText('照片暂时未载入 · 点按查看',canvas.width/2,canvas.height/2);
    texture.needsUpdate=true;
  };
  image.onerror=fail;
  if (photo.url) image.src=photo.url;
  else if (loadURL) Promise.resolve().then(()=>loadURL(photo.id)).then(url=>{
    if (!url) { fail(); return; }
    image.src=url;
  }).catch(fail);
  else fail();
  return texture;
}

function frameMoulding(width, height, rail) {
  const shape=new THREE.Shape();
  const w=width/2,h=height/2;
  shape.moveTo(-w,-h);shape.lineTo(w,-h);shape.lineTo(w,h);shape.lineTo(-w,h);shape.closePath();
  const cut=new THREE.Path();
  cut.moveTo(-w+rail,-h+rail);cut.lineTo(-w+rail,h-rail);cut.lineTo(w-rail,h-rail);cut.lineTo(w-rail,-h+rail);cut.closePath();
  shape.holes.push(cut);
  return new THREE.ExtrudeGeometry(shape,{depth:.062,bevelEnabled:true,bevelThickness:.014,bevelSize:.014,bevelSegments:3});
}

function buildGallery(parent, photos, textures, owner, loadPhotoURL) {
  const targets = [];
  const placements = owner==='david' ? [
    [-4.25,2.43,-4.31,0],[-1.43,2.43,-4.31,0],[1.43,2.43,-4.31,0],[4.25,2.43,-4.31,0],
    [-6.81,2.65,-.84,Math.PI/2],[-6.81,2.65,2.51,Math.PI/2],
    [-4.25,4.58,-4.31,0],[-1.43,4.58,-4.31,0],[1.43,4.58,-4.31,0],[4.25,4.58,-4.31,0],
    [6.81,3.45,.32,-Math.PI/2],[6.81,3.45,2.89,-Math.PI/2]
  ] : [
    [0,2.45,-4.31,0],[-2.8,2.45,-4.31,0],[2.8,2.45,-4.31,0],
    [-4.45,4.52,-4.31,0],[-1.5,4.52,-4.31,0],[1.5,4.52,-4.31,0],[4.45,4.52,-4.31,0],
    [-6.81,3.45,2.85,Math.PI/2],[-6.81,3.45,.25,Math.PI/2],
    [6.81,3.45,-2.35,-Math.PI/2],[6.81,3.45,.15,-Math.PI/2],[6.81,3.45,2.65,-Math.PI/2]
  ];
  const items = Array.from({length:placements.length}, (_, index) => ({photo:null,label:`等待照片 ${String(index + 1).padStart(2,'0')}`}));
  const used = new Set();
  (photos || []).filter(photo=>Number(photo.wallSlot)!==-1).slice(0,placements.length).forEach((photo,index) => {
    let slot = Number(photo.wallSlot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= placements.length || used.has(slot)) slot = items.findIndex((_,candidate) => !used.has(candidate));
    if (slot < 0) return;
    used.add(slot);
    items[slot] = {photo,label:photo.caption || `照片 ${index + 1}`};
  });
  const frameStyles = {
    walnut:{outer:material(0x493126,{roughness:.38,metalness:.06}),edge:material(0xa77942,{roughness:.25,metalness:.42}),plaque:0x4f344f},
    champagne:{outer:material(0xb89568,{roughness:.3,metalness:.32}),edge:material(0xe8c98e,{roughness:.2,metalness:.55}),plaque:0x72583c},
    black:{outer:material(0x18171c,{roughness:.28,metalness:.24}),edge:material(0x6e6677,{roughness:.24,metalness:.38}),plaque:0x25222b}
  };
  const channels={};
  const pool=canvasTexture(256,256,(ctx,w,h)=>{
    ctx.fillStyle='#050403';ctx.fillRect(0,0,w,h);
    ctx.save();ctx.translate(w*.5,-h*.06);ctx.scale(w*.73,h*1.18);
    const g=ctx.createRadialGradient(0,0,0,0,0,1);
    g.addColorStop(0,'#ffe8bd');g.addColorStop(.36,'#ceb187');g.addColorStop(.75,'#715c49');g.addColorStop(1,'#050403');
    ctx.fillStyle=g;ctx.fillRect(-2,-1,4,3);ctx.restore();
  });
  pool.channel=0;
  const railGeometry=frameMoulding(1.90,1.51,.071);
  const lipGeometry=frameMoulding(1.733,1.343,.016);
  const glassMat = new THREE.MeshPhysicalMaterial({color:0xffffff,transparent:true,opacity:.032,roughness:.12,clearcoat:1,depthWrite:false});
  items.forEach((item,index)=>{
    const [x,y,z,rotationY]=placements[index];
    const group=new THREE.Group();
    group.position.set(rotationY ? Math.sign(x)*6.84 : x,y,rotationY ? z : -4.455);
    group.rotation.y=rotationY; parent.add(group);
    const style=frameStyles[item.photo?.frameStyle] || frameStyles[owner==='david' ? 'black' : 'walnut'];
    box(group,[1.89,1.50,.085],style.outer,[0,0,-.012]);
    addMesh(group,railGeometry,style.outer,[0,0,.045]);
    addMesh(group,lipGeometry,style.edge,[0,0,.032]);
    const matBoard=material(0xeee7d9,{roughness:.97});
    matBoard.lightMap=pool;
    addMesh(group,new THREE.PlaneGeometry(1.755,1.37),matBoard,[0,0,.057]);
    const wash=[matBoard];
    if(item.photo) {
      const artMat=material(0xffffff,{map:photoTexture(item.photo,loadPhotoURL),roughness:.94});
      artMat.lightMap=pool;wash.push(artMat);
      const art=addMesh(group,new THREE.PlaneGeometry(1.52,1.098),artMat,[0,0,.061]);
      art.castShadow=false;art.userData.photo=item.photo;targets.push(art);
    }
    const glass=addMesh(group,new THREE.PlaneGeometry(1.72,1.33),glassMat,[0,0,.092]);
    glass.castShadow=glass.receiveShadow=false;
    const lamp=material(0xffe5b3,{emissive:0xffbf76,emissiveIntensity:1.65,roughness:.4});
    box(group,[.14,.09,.06],style.edge,[0,.865,.035]);
    box(group,[.037,.04,.20],style.edge,[0,.875,.14]);
    const hood=cylinder(group,.046,.046,.66,style.edge,[0,.865,.237],24,[0,0,Math.PI/2]);
    const strip=box(group,[.60,.023,.048],lamp,[0,.824,.237]);
    hood.castShadow=strip.castShadow=false;
    const n=String(index+1).padStart(2,'0');
    const caption=item.photo ? item.label : '记忆留白 · '+n;
    const plaqueMap=labelTexture(caption);textures.push(plaqueMap);
    const plaque=addMesh(group,new THREE.PlaneGeometry(.68,.101),material(0xffffff,{map:plaqueMap,roughness:.69}),[0,-.855,.044]);
    plaque.castShadow=false;
    channels[(owner==='david' ? 'david-' : '')+'picture-'+n]={label:`${owner==='david' ? 'David ' : ''}${n} · ${caption}`,material:lamp,onIntensity:1.65,fixtures:[hood,strip],wash};
  });
  textures.push(pool);
  return {targets,channels};
}

function disposeObject(root) {
  const materials=new Set(),geometry=new Set(),textures=new Set();
  root.traverse(object => {
    if (object.geometry) geometry.add(object.geometry);
    for(const mat of [].concat(object.material || [])) materials.add(mat);
    if (object.isInstancedMesh) object.dispose();
    if (object.isSkinnedMesh) object.skeleton.dispose();
  });
  for (const mat of materials) {
    for (const value of Object.values(mat)) if (value?.isTexture) textures.add(value);
    mat.dispose();
  }
  for (const value of geometry) value.dispose();
  for (const texture of textures) texture.dispose();
}

export function supportsRoom3D() {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!context;
  } catch (_) {
    return false;
  }
}

const roomPreferences = new Map();

function preferencesFor(theme) {
  const id = theme || 'everyday';
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem('lynn.room.settings.v1:' + id) || 'null');
    if (!saved && !roomPreferences.has(id) && id === 'everyday') {
      const legacy = JSON.parse(localStorage.getItem('lynn.room.lights') || 'null');
      if (legacy) saved = {lights:legacy};
    }
  } catch (_) {}
  saved ||= roomPreferences.get(id);
  const stored = saved?.seat?.view;
  const view = stored && [stored.yaw, stored.pitch, stored.fov].every(Number.isFinite) ? {
    yaw:stored.yaw % (Math.PI*2),
    pitch:THREE.MathUtils.clamp(stored.pitch,playerLookDown,.92),
    fov:THREE.MathUtils.clamp(stored.fov,46,74)
  } : null;
  const preferences = {
    lights:saved?.lights || {},
    seat:{view, seated:!!view && saved?.seat?.seated === true,slot:saved?.seat?.slot},
    dusk:saved?.dusk,
    ambience:saved?.ambience === true
  };
  roomPreferences.set(id, preferences);
  return preferences;
}

function storeRoomPreferences(theme, preferences, field) {
  const key = 'lynn.room.settings.v1:' + (theme || 'everyday');
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify({...preferences,...saved,[field]:preferences[field]}));
  } catch (_) {}
}

export function mountRoom3D(stage, options = {}) {
  if (!stage) throw new Error('3D room stage is unavailable');
  const mobile = innerWidth < 760 || (navigator.maxTouchPoints>0 && matchMedia('(any-pointer: coarse)').matches);
  const skyLight=exterior[festivalExterior[options.theme]] || exterior.sunset;
  const snowNight=skyLight===exterior.snow;
  const sunset=skyLight===exterior.sunset;
  let daylightLabel=skyLight.label;
  let destroyed=false;
  const night = skyLight.night || skyLight===exterior.fireworks || skyLight===exterior.snow || skyLight===exterior.lake ||
    skyLight===exterior.stars || skyLight===exterior.canal;
  const canvas = document.createElement('canvas');
  canvas.className = 'room-3d-canvas';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', '3D 照片房间。点击后使用 W A S D 移动，拖动查看四周，按 E 查看面前的照片。');
  stage.removeAttribute('aria-hidden');
  const hud = document.createElement('div');
  hud.className = 'room-3d-hud';
  hud.innerHTML = '<i aria-hidden="true"></i><p>点击房间后用 <kbd>WASD</kbd> 移动 · 拖动环顾 · 滚轮缩放</p><small>点击照片查看 · 走近也可按 E</small><div class="room-light-controls"><button type="button" class="room-light-trigger" data-room-light-trigger aria-expanded="false">灯光</button><div class="room-light-panel" data-room-light-panel><strong>房间灯光</strong><section data-room-main-lights></section><details><summary>相框画灯</summary><section data-room-picture-lights></section></details><label class="room-dimmer">亮度 <output>100%</output><input type="range" min="10" max="100" step="5" value="100" aria-label="灯光亮度" data-room-dimmer></label><div><button type="button" data-room-light-scene="sunset">只留夕阳</button><button type="button" data-room-light-scene="cozy">暖灯</button><button type="button" data-room-light-scene="all">全部点亮</button></div></div></div><button type="button" class="room-joystick" aria-label="移动摇杆，拖动来走路"><span aria-hidden="true"></span></button>';
  const naturalPreset=hud.querySelector('[data-room-light-scene="sunset"]');
  naturalPreset.textContent='只留'+daylightLabel;
  const seatButton = document.createElement('button');
  seatButton.type = 'button';
  seatButton.className = 'room-seat-action';
  seatButton.textContent = '坐上沙发';
  seatButton.hidden = true;
  hud.appendChild(seatButton);
  const bedButton=document.createElement('button');
  bedButton.type='button';
  bedButton.className='room-seat-action room-bed-action';
  bedButton.textContent='躺到床上';
  bedButton.hidden=true;
  hud.appendChild(bedButton);
  const fullscreenButton = document.createElement('button');
  fullscreenButton.type = 'button';
  fullscreenButton.className = 'room-fullscreen-action room-light-trigger';
  fullscreenButton.textContent = '全屏';
  fullscreenButton.setAttribute('aria-pressed','false');
  fullscreenButton.hidden = !document.fullscreenEnabled || typeof stage.requestFullscreen !== 'function';
  hud.appendChild(fullscreenButton);
  const sceneTools = document.createElement('div');
  sceneTools.className = 'room-scene-tools';
  hud.appendChild(sceneTools);
  const splash = document.createElement('div');
  splash.className = 'room-backdrop-loading';
  splash.innerHTML = '<section aria-label="窗景加载"><p role="status">正在加载窗外风景…</p><progress aria-label="窗景加载进度" max="100"></progress><button type="button" hidden>重试窗景</button></section>';
  const backdropBar=splash.querySelector('progress');
  const backdropMessage=splash.querySelector('p');
  const backdropRetry=splash.querySelector('button');
  stage.dataset.roomBackdrop='loading';
  stage.setAttribute('aria-busy','true');
  canvas.style.visibility=hud.style.visibility='hidden';
  stage.replaceChildren(canvas, hud, splash);

  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: mobile ? 'low-power' : 'high-performance'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .97;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;


  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xadb4c0);
  const environment = canvasTexture(1024,512,(ctx,width,height) => {
    const sky=ctx.createLinearGradient(0,0,0,height);
    const color = hex => new THREE.Color(hex).getStyle();
    sky.addColorStop(0,sunset ? '#9daec4' : color(skyLight.sky));
    sky.addColorStop(.42,sunset ? '#c8c7c4' : color(skyLight.fill));
    sky.addColorStop(.54,sunset ? '#aaa49b' : color(skyLight.bounce));
    sky.addColorStop(1,sunset ? '#554e45' : color(skyLight.ground));
    ctx.fillStyle=sky; ctx.fillRect(0,0,width,height);
    const windowGlow=ctx.createRadialGradient(width*.18,height*.46,0,width*.18,height*.46,width*.28);
    if (sunset) {
      windowGlow.addColorStop(0,'rgba(255,216,151,.8)'); windowGlow.addColorStop(.35,'rgba(255,178,95,.34)'); windowGlow.addColorStop(1,'rgba(255,178,95,0)');
    } else {
      const glow = new THREE.Color(skyLight.sun).getHexString();
      windowGlow.addColorStop(0,'#'+glow+(night?'38':'70')); windowGlow.addColorStop(1,'#'+glow+'00');
    }
    ctx.fillStyle=windowGlow; ctx.fillRect(0,0,width,height);
  });
  environment.mapping=THREE.EquirectangularReflectionMapping;
  scene.environment=environment;
  scene.environmentIntensity=skyLight.reflection;
  const roomFov = mobile ? 62 : 55;
  const camera = new THREE.PerspectiveCamera(roomFov, 1, .08, 100);
  camera.position.set(1.3, standingEye, -2.05);
  camera.rotation.order = 'YXZ';
  const initialLook=options.startAt || new URLSearchParams(location.search).get('room-look');
  let yaw = initialLook === 'gallery' ? 0 : initialLook === 'sofa' ? Math.PI / 2 : initialLook === 'window' ? Math.PI : 3.28, pitch = -.055;
  if (initialLook==='fog-window' || initialLook==='david-fog-window'){
    camera.position.set((initialLook==='fog-window'?0:davidRoomX)+1.72,1.56,3.15);yaw=Math.PI;pitch=0;
  } else if(initialLook==='entry-inside' || initialLook==='david-entry-inside'){
    const david=initialLook==='david-entry-inside';
    camera.position.set(david?davidRoomX+5.84:-5.84,1.56,hallZ);yaw=david?-Math.PI/2:Math.PI/2;pitch=0;
  } else if(initialLook==='entry-light' || initialLook==='david-entry-light'){
    const david=initialLook==='david-entry-light';
    camera.position.set(david?davidRoomX+3.53:-3.53,1.55,hallZ);yaw=david?-Math.PI/2:Math.PI/2;pitch=0;
  } else if(initialLook==='shared-dusk'){
    camera.position.set(2.8,1.56,6.17);yaw=Math.PI;pitch=0;
  } else if(initialLook==='hall-board'){
    camera.position.set(davidRoomX/2,1.56,hallZ+.56);yaw=0;pitch=0;
  } else if(initialLook==='entry'){
    camera.position.set(-8.2,1.56,hallZ);yaw=-Math.PI/2;pitch=0;
  } else if (initialLook === 'david') {
    camera.position.set(davidRoomX-.86,playerEyeHeight,-2.94);
    yaw=2.98; pitch=-.095;
  } else if (initialLook==='david-sofa' || initialLook==='lynn-sofa') {
    const david=initialLook==='david-sofa';
    camera.position.set(david ? davidRoomX-3.44 : -3.90,playerEyeHeight,david ? .63 : 1.76);
    yaw=david ? 1.48 : .20;
    pitch=-.24;
  } else if (initialLook === 'david-window') {
    camera.position.set(davidRoomX-1.73,playerEyeHeight,3.79);
    yaw=3.66; pitch=.085;
  } else if (initialLook === 'bookcase') {
    camera.position.set(davidRoomX+3.48,playerEyeHeight,-2.04);
    yaw=-.12; pitch=-.43;
  } else if (initialLook === 'david-desk') {
    camera.position.set(davidRoomX-.35,playerEyeHeight,1.24);
    yaw=-2.14; pitch=-.29;
  } else if (initialLook === 'david-lounge') {
    camera.position.set(davidRoomX-.79,playerEyeHeight,1.64);
    yaw=1.11; pitch=-.23;
  } else if (initialLook === 'david-festival') {
    const christmas=options.theme==='christmas';
    camera.position.set(davidRoomX+(christmas ? 1.57 : 2.42),playerEyeHeight,christmas ? -.61 : -.33);
    yaw=christmas ? -2.16 : -1.93;
    pitch=christmas ? -.026 : -.13;
  } else if (initialLook === 'gallery') {
    camera.position.set(0, standingEye, 3.65);
    pitch = .25;
  } else if (initialLook === 'village') {
    camera.position.set(1.15,standingEye,-2.85);
    yaw=2.84;
    pitch=-.085;
  } else if (initialLook === 'window') {
    camera.position.set(1.3,standingEye,3.12);
    camera.fov=mobile ? 58 : 52;
    pitch=-.036;
  } else if (initialLook === 'bench') {
    camera.position.set(2.33,standingEye,1.28);
    yaw=3.32; pitch=-.14;
  } else if (initialLook === 'decor') {
    const tree = options.theme === 'christmas';
    camera.position.set(tree ? -.35 : -.75,1.55,tree ? -.57 : .04);
    yaw=tree ? 2.74 : 2.76;
    pitch=tree ? .04 : -.19;
  } else if (!initialLook || initialLook === 'character') {
    camera.position.set(mobile ? -.35 : .65, standingEye, -2.87);
    yaw = 3.18;
    pitch = initialLook === 'character' ? playerLookDown : -.055;
  }

  camera.position.y = playerEyeHeight;
  const ambient = new THREE.HemisphereLight(skyLight.sky,skyLight.ground,skyLight.ambient);
  scene.add(ambient);
  // One low sun, with cool sky fill. Window mullions cast long coherent shadows.
  const key = new THREE.DirectionalLight(skyLight.sun,skyLight.direct);
  key.position.set(...skyLight.direction);
  key.target.position.set(davidRoomX/2,1,-1.5);
  key.position.x+=davidRoomX/2;
  scene.add(key.target);
  key.castShadow = true;
  const shadowSize = mobile ? 1536 : Math.min(3072,renderer.capabilities.maxTextureSize);
  key.shadow.mapSize.set(shadowSize, shadowSize);
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = sunset ? 7.5 : 9;
  key.shadow.camera.bottom = sunset ? -3.2 : -7;
  key.shadow.camera.near=.5;
  key.shadow.camera.far=70;
  key.shadow.bias = -.00012;
  key.shadow.normalBias = .010;
  key.shadow.radius = sunset ? (mobile ? 2.3 : 2.7) : (skyLight===exterior.river || night ? 4 : 2.7);
  scene.add(key);

  const windowFill = new THREE.RectAreaLight(skyLight.fill, skyLight.intensity, 12.8, 5.8);
  windowFill.position.set(0,3.3,4.35);
  windowFill.lookAt(0,sunset ? 3.3 : 2,-3.6);
  const davidWindowFill=windowFill.clone();
  davidWindowFill.position.x+=davidRoomX;
  scene.add(windowFill,davidWindowFill);
  const floorBounce = new THREE.RectAreaLight(skyLight.bounce, skyLight.intensity * (sunset ? .30 : .35), 8, sunset ? 4.1 : 6);
  floorBounce.position.set(sunset ? .3 : 0,.08,sunset ? 1.86 : .5);
  floorBounce.lookAt(floorBounce.position.x,4,floorBounce.position.z);
  const davidBounce=floorBounce.clone();
  davidBounce.position.x+=davidRoomX;
  scene.add(floorBounce,davidBounce);

  let darkTarget = 0;
  let darkLevel = null;
  let transition = 0, shadowAt = -1;
  const bouncePower = floorBounce.intensity;
  const daylightGlass = sunset ? new THREE.Color(0xf4f7fa) : null;
  const twilightGlass = sunset ? new THREE.Color(0xb8c8e4) : null;
  const {lerp,smoothstep} = THREE.MathUtils;
  const clearSunColor = key.color.clone();
  const settingSunColor = new THREE.Color(0xff7955);
  const changes = sunset ? [
    [ambient.color, ambient.color.clone(), new THREE.Color(0x9eb5e0)],
    [ambient.groundColor, ambient.groundColor.clone(), new THREE.Color(0x47465f)],
    [windowFill.color, windowFill.color.clone(), new THREE.Color(0x9ab3e1)],
    [floorBounce.color, floorBounce.color.clone(), new THREE.Color(0x8a94b4)]
  ] : [];
  const updateNaturalLight = amount => {
    const fade = sunset ? smoothstep(transition,.12,1) : 0;
    const nightLevel = night ? 1 : fade;
    const {azimuth,elevation}=duskSun(transition);
    const direct = sunset ? sunlightAboveRidge(azimuth,elevation) : 1;
    scene.environmentIntensity = lerp(skyLight.reflection,.115,fade) * (1-amount*lerp(.14,.42,nightLevel));
    ambient.intensity = lerp(skyLight.ambient,.31,fade) * (1-amount*lerp(.17,.46,nightLevel));
    windowFill.intensity = lerp(skyLight.intensity,.38,fade) * (1-amount*lerp(.12,.38,nightLevel));
    floorBounce.intensity = lerp(bouncePower*(sunset ? .58+.42*direct : 1),.069,fade) * (1-amount*lerp(.23,.64,nightLevel));
    davidWindowFill.intensity=windowFill.intensity;
    davidBounce.intensity=floorBounce.intensity;
    key.intensity = skyLight.direct * direct * (1-amount*lerp(.045,.19,nightLevel));
    if (!sunset) return;
    for (const [color,day,nightColor] of changes) color.copy(day).lerp(nightColor,fade);
    davidWindowFill.color.copy(windowFill.color);
    davidBounce.color.copy(floorBounce.color);
    key.color.copy(clearSunColor).lerp(settingSunColor,1-direct);
    valleySun.value.set(azimuth,elevation);
    const distance = 38, sunBearing=azimuth;
    key.position.set(key.target.position.x+distance*Math.sin(sunBearing)*Math.cos(elevation),
      distance*Math.sin(elevation)+1,distance*Math.cos(sunBearing)*Math.cos(elevation)-1.5);
    windowGlass.opacity = lerp(.026,.061,fade);
    windowGlass.color.copy(daylightGlass).lerp(twilightGlass,fade);
    windowGlass.envMapIntensity = lerp(.29,.47,fade);
    if (direct > .025 && Math.abs(transition-shadowAt) >= .004) {
      shadowAt = transition;
      renderer.shadowMap.needsUpdate = true;
    }
  };

  const connection = navigator.connection;
  const dataSaving = connection?.saveData || ['slow-2g','2g'].includes(connection?.effectiveType);
  const textureLimit = renderer.capabilities.maxTextureSize;
  const windowQuality = {
    uhd:!dataSaving && !mobile && textureLimit >= 3840,
    onBackdrop({state,fraction}) {
      stage.dataset.roomBackdrop=state==='ready' ? 'decoded' : state;
      backdropRetry.hidden=state!=='error';
      backdropBar.hidden=state==='error';
      if (fraction===null) backdropBar.removeAttribute('value');
      else backdropBar.value=Math.floor(fraction*100);
      const title=state==='error' ? '窗外风景暂时没加载成功。'
        : state==='loading' ? '正在加载窗外风景…' : '正在绘制窗景…';
      if (backdropMessage.textContent!==title) backdropMessage.textContent=title;
      if (state==='ready') start();
    },
    tiles:!dataSaving && !mobile && textureLimit >= 3840 && location.protocol!=='file:' && (navigator.deviceMemory || 8) >= 4,
    hd:!dataSaving && textureLimit >= 3548,
    anisotropy:THREE.MathUtils.clamp(renderer.capabilities.getMaxAnisotropy(),1,16)
  };
  const {room,davidRoom,valley,harborFlashes,valleyMask,duskPhase,valleySun,moonMap,windowGlass,balconyDoors} =
    buildRoom(scene,skyLight,windowQuality,options.theme || 'everyday');
  backdropRetry.onclick=valley.retry;
  const fireworks = harborFlashes ? buildHarborFireworks(room,scene,harborFlashes,mobile) : null;
  let fireworksTime = 0, fireworksPainted = false;
  let steamTime = 0, teaSteam = null;
  const snowfall=snowNight || skyLight.snowCover
    ? [buildOutdoorSnow(room,mobile,!snowNight),buildOutdoorSnow(davidRoom,mobile,!snowNight)] : [];
  const dust = sunset ? buildSunsetAtmosphere(room) : null;
  const ceilingLights=buildCeilingLights(room, scene, mobile).channels;
  const davidCeiling = new THREE.PointLight(0xffe9d1,26,11,2);
  davidCeiling.position.set(davidRoomX,4.3,-.5);
  scene.add(davidCeiling);
  const hallLight = new THREE.PointLight(0xffd6a4,14,5,2);
  // A real local shadow is important here: these two doors can be in different states.
  hallLight.castShadow=true;
  hallLight.shadow.mapSize.set(mobile?256:512,mobile?256:512);
  hallLight.shadow.camera.near=.08;
  hallLight.shadow.camera.far=hallLight.distance;
  hallLight.shadow.camera.updateProjectionMatrix();
  hallLight.shadow.normalBias=.003;
  hallLight.shadow.bias=-.00012;
  hallLight.position.set(davidRoomX/2,2.61,hallZ);
  scene.add(hallLight);
  const hallBulb=material(0xf4d8ae,{emissive:0xffd6a4,emissiveIntensity:1});
  const hallMetal=material(0xa98c66,{metalness:.53,roughness:.40});
  const hallFixtures=[];
  for(const offset of [-.90,.90]) {
    const x=davidRoomX/2+offset;
    const rim=cylinder(scene,.232,.216,.054,hallMetal,[x,2.897,hallZ],36);
    const diffuser=cylinder(scene,.193,.166,.056,hallBulb,[x,2.851,hallZ],36);
    rim.castShadow=diffuser.castShadow=false;
    hallFixtures.push(rim,diffuser);
  }
  const owned = new Set(options.owned || []);
  const sofas={
    lynn:{model:null,bounds:new THREE.Box3()},
    david:{model:null,bounds:new THREE.Box3()}
  };
  const sofaSeats=Object.values(sofas).flatMap((sofa,index)=>{
    const roomName=index ? 'david' : 'lynn';
    return [-1,1].map((side,i)=>({
      id:roomName+(i ? '-right' : '-left'),room:roomName,sofa,
      eye:new THREE.Vector3(index ? davidRoomX-4.05 : -4.35-side*.42,playerEyeHeight-playerSeatDrop,
        index ? -.21+side*.42 : 1.21),
      exit:new THREE.Vector3(index ? davidRoomX-3.69 : -4.35-side*.42,playerEyeHeight,
        index ? -.21+side*.42 : 1.66),
      facing:index ? -Math.PI/2 : Math.PI
    }));
  });
  for(const [name,offset] of [['lynn',0],['david',davidRoomX]]){
    const bench=new THREE.Group();bench.position.set(offset+2.8,0,5.42);scene.add(bench);
    const woodSeat=material(0x845842,{roughness:.53}),legs=material(0x3d3538,{roughness:.47,metalness:.35});
    for(const x of [-.91,.91]){
      box(bench,[.07,.45,.45],legs,[x,.08,0]);
      box(bench,[.062,.68,.05],legs,[x,.50,-.23]);
    }
    for(const z of [-.17,-.056,.056,.17])box(bench,[2.17,.068,.105],woodSeat,[0,.40,z]);
    for(const y of [.63,.75,.87])box(bench,[2.17,.091,.055],woodSeat,[0,y,-.235]);
    for(const [side,dx] of [['left',-.47],['right',.47]]){
      sofaSeats.push({id:name+'-terrace-'+side,room:name,terrace:true,sofa:{model:bench},facing:Math.PI,
        eye:new THREE.Vector3(offset+2.8+dx,playerEyeHeight-playerSeatDrop-.08,5.56),
        exit:new THREE.Vector3(offset+2.8+dx,playerEyeHeight,6.12)});
    }
  }
  const setSofa=(roomName,model)=>{
    sofas[roomName].model=model;
    model.updateWorldMatrix(true,true);
    const bounds=sofas[roomName].bounds.setFromObject(model);
    // Place the shin joints past the cushion edge, using the loaded model's
    // actual bounds for either sofa orientation and for the fallback model.
    for(const seat of sofaSeats.filter(item=>item.room===roomName&&!item.terrace)) {
      if (roomName==='david') seat.eye.x=bounds.max.x-.115;
      else seat.eye.z=bounds.max.z-.115;
    }
  };
  stage.dataset.roomAssets='loading';
  const modelLoads=[];
  const placeModel=(url,settings,fallback,parent=room) => {
    const request=loadRealModel(parent,url,settings).catch(reason => {
      fallback?.();
      console.warn('[Lynn room] Model unavailable:',url,reason);
      throw reason;
    });
    modelLoads.push(request);
    return request;
  };
  const roomTools={material,addMesh,box,cylinder,sphere,canvasTexture,glaze:handGlaze(),grain:furnitureGrain(canvasTexture)};
  const finish=roomFinishes[options.theme] || roomFinishes.everyday;
  const windowBench=buildWindowBench(room,options.theme || 'everyday',roomTools);
  if(options.theme) buildRug(room,finish); else buildEverydayRug(room);
  buildRug(davidRoom,{rug:0x8c9e95,trim:0x3a5851},'David');
  const lynnBed=buildBedroomBed(room,4.6,-2.53,{fabric:0xba9bb7,quilt:0xd6bdcf,thread:'#a58397'},roomTools);
  const {lamp:davidDeskLamp,obstacles:davidObstacles}=buildDavidFurniture(davidRoom,roomTools);
  const davidBed=buildBedroomBed(davidRoom,1.08,-2.61,{fabric:0x637f79,quilt:0xa8b7a9,thread:'#778d84'},roomTools);
  davidObstacles.push(davidBed);
  placeModel('assets/models/sofa_02/sofa_02_1k.gltf',{
    name:'real-sofa',targetWidth:3.24,heightScale:.64,position:[-4.68,.008,-.21],
    rotationY:Math.PI/2,tint:0x43635c,replaceColorMap:true,roughness:.85
  },()=>{
    const fallback=buildBed(davidRoom);
    fallback.position.set(-4.68,.018,-.21);
    fallback.rotation.y=Math.PI/2;
    fallback.scale.y=.516;
    setSofa('david',fallback);
  },davidRoom).then(model=>{
    if (!model || destroyed || !stage.isConnected) return;
    setSofa('david',model);
    addLoungeCushions(davidRoom,model,roomTools);
  },()=>{});
  placeModel('assets/models/modern_coffee_table_01/modern_coffee_table_01_1k.gltf',{
    name:'real-coffee-table',targetWidth:1.26,position:[-2.88,.015,-.38],rotationY:Math.PI/2
  },undefined,davidRoom).then(model=>{
    if (!destroyed && stage.isConnected) dressDavidCoffeeTable(davidRoom,model,roomTools);
  },()=>{});
  davidObstacles.push([-5.47,-3.92,-1.96,1.54],[-3.48,-2.30,-1.13,.37]);
  if (owned.has('bed')) {
    placeModel('assets/models/sofa_02/sofa_02_1k.gltf',{name:'real-sofa',targetWidth:3.45,heightScale:.605,position:[-4.35,.007,.55],rotationY:0,tint:0x8c7898,replaceColorMap:true,roughness:.87},() => {
      const fallback = buildBed(room);
      fallback.scale.y = .50;
      fallback.position.y = .015;
      fallback.position.set(-4.35,.015,.55);
      fallback.rotation.y=0;
      setSofa('lynn',fallback);
    }).then(model => {
      if (!stage.isConnected) return;
      setSofa('lynn',model);
      drapeSofaThrow(room,model,roomTools,finish.throw);
    }, () => {});
    placeModel('assets/models/throw_pillows_01/throw_pillows_01_1k.gltf',{name:'real-pillows',targetWidth:1.05,position:[-5.18,.52,.43],rotationY:0,tint:0xc6aeb4,replaceColorMap:true,roughness:.92});
  }
  const floorLamp=owned.has('lamp') ? buildLamp(room, scene) : null;
  if (owned.has('plant')) placeModel('assets/models/potted_plant_01/potted_plant_01_1k.gltf',{name:'real-plant',targetHeight:1.9,position:[5.12,.02,2.25],rotationY:-.35},() => buildPlant(room));
  if (owned.has('outfit')) {
    placeModel('assets/models/modern_coffee_table_01/modern_coffee_table_01_1k.gltf',{name:'real-coffee-table',targetWidth:1.55,position:[-4.25,.02,2.45],rotationY:0})
      .then(table => {
        if (!stage.isConnected) return;
        teaSteam = furnishSideTable(room,table,roomTools);
        teaSteam.resize(canvas.height);
      }, () => {});
    placeModel('assets/models/antique_ceramic_vase_01/antique_ceramic_vase_01_1k.gltf',{name:'real-vase',targetHeight:.38,position:[-4.25,.53,2.45],rotationY:.35});
  }
  let player = null;
  placeModel(characterAsset,{
    name:'room-character',targetHeight:1.68,preciseBounds:true,
    canAttach:()=>!destroyed && stage.isConnected
  }).then(model=>{
    if (!model || destroyed) return;
    player = bindRoomPlayer(model);
    // The render loop places the body at the camera on its first frame.
  },()=>{});
  Promise.allSettled(modelLoads).then(results => {
    if (destroyed || !stage.isConnected) return;
    addFloorContacts(room);
    addFloorContacts(davidRoom);
    stage.dataset.roomAssets=results.every(result=>result.status==='fulfilled') ? 'ready' : 'partial';
    renderer.shadowMap.needsUpdate=true;
  });
  const textures = [];
  const gallery=buildGallery(room, options.photos || [], textures,'lynn',options.loadPhotoURL);
  const davidGallery=buildGallery(davidRoom,options.davidPhotos || [],textures,'david',options.loadPhotoURL);
  const season=options.theme ? buildSeason(room,options.theme,roomTools) : buildReadingCart(room,roomTools);
  const davidSeason=buildSeason(davidRoom,options.theme,roomTools,'david');
  if(davidSeason) davidObstacles.push(davidSeason.obstacle);
  const davidFestivalLights=Object.fromEntries(Object.entries(davidSeason?.channels || {}).map(([key,channel])=>
    ['david-'+key,{...channel,label:'David · '+channel.label}]));
  const photoTargets = [...gallery.targets,...davidGallery.targets];

  const lightChannels={
    'ceiling-left':ceilingLights[0],
    'ceiling-center':ceilingLights[1],
    'ceiling-right':ceilingLights[2],
    ...(floorLamp ? {'floor-lamp':floorLamp} : {}),
    'david-main':{label:'David 房间顶灯',light:davidCeiling},
    'david-desk':davidDeskLamp,
    'hall-main':{label:'走廊灯',light:hallLight,material:hallBulb,onIntensity:1,fixtures:hallFixtures},
    ...gallery.channels, ...davidGallery.channels, ...season?.channels, ...davidFestivalLights, ...windowBench.channels
  };
  const clockCandle = lightChannels['new-year-candle'];
  const lightTrigger=hud.querySelector('[data-room-light-trigger]');
  const lightPanel=hud.querySelector('[data-room-light-panel]');
  const dimmer=lightPanel.querySelector('[data-room-dimmer]');
  const groupSwitch=document.createElement('input');
  groupSwitch.type='checkbox';
  const pictureList=lightPanel.querySelector('[data-room-picture-lights]');
  const groupLabel=document.createElement('label');
  groupLabel.append(groupSwitch,'全部画灯');
  pictureList.append(groupLabel);
  const fixtures=[];
  const preferences=preferencesFor(options.theme);
  const saved=preferences.lights;
  const lightState={};
  let dim=THREE.MathUtils.clamp(Number(saved.brightness) || 100,10,100);
  const pictureKeys=[...Object.keys(gallery.channels),...Object.keys(davidGallery.channels)];
  const cozyLight = key => !key.startsWith('ceiling-');
  // Read the previous single gallery switch when migrating a stored room.
  for (const [key,channel] of Object.entries(lightChannels)) {
    const picture=pictureKeys.includes(key);
    const inherited=picture ? saved.gallery : undefined;
    lightState[key]=saved.sunsetOnly === true ? false : (saved[key] ?? inherited ?? cozyLight(key));
    const input=document.createElement('input');input.type='checkbox';input.dataset.roomLight=key;
    const label=document.createElement('label');label.append(input,document.createTextNode(channel.label));
    (picture ? pictureList : lightPanel.querySelector('[data-room-main-lights]')).append(label);
    channel.input=input;
    channel.sources=[...(channel.light ? [channel.light] : []),...(channel.lights || [])].map(light=>({light,power:light.intensity}));
    for (const fixture of channel.fixtures || []) {
      fixture.userData.lightKey=key; fixtures.push(fixture);
    }
  }
  const lightSceneButtons=[...lightPanel.querySelectorAll('[data-room-light-scene]')];
  const applyLightState=save=>{
    let active=0;
    for(const [key,channel] of Object.entries(lightChannels)){
      const on=!!lightState[key],level=on ? dim/100 : 0;
      active+=Number(on);
      channel.input.checked=on;
      for(const {light,power} of channel.sources) light.intensity=power*level;
      if(channel.material) channel.material.emissiveIntensity=channel.onIntensity*level;
      if(channel.halo){channel.halo.visible=on;channel.halo.material.opacity=.70*level;}
      if(channel.beam){
        channel.beam.visible=on;
        channel.beam.material.uniforms.strength.value=.088*level;
      }
      for(const mat of channel.wash || []) mat.lightMapIntensity=2.8*level;
    }
    darkTarget = active===0 ? 1 : 0;
    if (darkLevel === null) {
      darkLevel = darkTarget;
      updateNaturalLight(darkLevel);
    }
    dimmer.value=String(dim);lightPanel.querySelector('output').textContent=dim+'%';
    groupSwitch.checked=pictureKeys.every(key=>lightState[key]);
    groupSwitch.indeterminate=!groupSwitch.checked && pictureKeys.some(key=>lightState[key]);
    lightTrigger.textContent=active ? `灯光 ${active}/${Object.keys(lightChannels).length}` : ('仅'+daylightLabel);
    for (const button of lightSceneButtons){
      const preset=button.dataset.roomLightScene;
      const selected=Object.keys(lightChannels).every(key => !!lightState[key] === (preset==='all' || (preset==='cozy' && cozyLight(key))));
      button.setAttribute('aria-pressed',String(selected));button.classList.toggle('active',selected);
    }
    if (save) {
      preferences.lights={...lightState, brightness:dim, sunsetOnly:active===0};
      storeRoomPreferences(options.theme,preferences,'lights');
    }
  };
  const setPanel=open=>{
    lightPanel.classList.toggle('open',open);
    lightTrigger.setAttribute('aria-expanded',String(open));
  };
  const toggleLightPanel=()=>setPanel(!lightPanel.classList.contains('open'));
  const dismissPanel=event=>{if(!lightTrigger.parentNode.contains(event.target)) setPanel(false);};
  const escapePanel=event=>{if(event.key==='Escape'){setPanel(false);lightTrigger.focus();}};
  const changeLight=event=>{
    const input=event.target;
    if(input===groupSwitch) pictureKeys.forEach(key=>{lightState[key]=input.checked;});
    else if(input.dataset.roomLight) lightState[input.dataset.roomLight]=input.checked;
    else return;
    applyLightState(true);
  };
  const changeBrightness=()=>{dim=Number(dimmer.value);applyLightState(true);};
  const chooseLightScene=event=>{
    const preset=event.currentTarget.dataset.roomLightScene;
    for(const key of Object.keys(lightChannels)) {
      lightState[key]=preset==='all' || (preset==='cozy' && cozyLight(key));
    }
    applyLightState(true);
  };
  lightTrigger.addEventListener('click',toggleLightPanel);
  lightPanel.addEventListener('change',changeLight);
  lightPanel.addEventListener('keydown',escapePanel);
  document.addEventListener('pointerdown',dismissPanel);
  dimmer.addEventListener('input',changeBrightness);
  lightSceneButtons.forEach(button=>button.addEventListener('click',chooseLightScene));
  applyLightState(false);

  const dusk = sunset ? mountDuskControl(sceneTools,preferences.dusk,(phase,label)=>{
    transition = duskPhase.value = phase;
    updateNaturalLight(darkLevel);
    if (label !== daylightLabel) {
      daylightLabel = label;
      naturalPreset.textContent = '只留' + label;
      if (!Object.values(lightState).some(Boolean)) lightTrigger.textContent = '仅' + label;
    }
  }, state => {
    preferences.dusk = state;
    storeRoomPreferences(options.theme,preferences,'dusk');
  }) : null;
  const ambience = mountRoomAmbience(stage,sceneTools,options.theme,preferences.ambience,enabled=>{
    preferences.ambience = enabled;
    storeRoomPreferences(options.theme,preferences,'ambience');
  });

  let width = 0, height = 0, frame = 0, visible = true;
  let dragging = false, dragged = false, dragX = 0, dragY = 0, nearPhoto = null;
  let smoothForward = 0, smoothSideways = 0, fovTarget = camera.fov, pinchDistance = 0;
  let seatView = preferences.seat.view;
  let seated=false, activeSeat=null, pendingSeat=null;
  let restoreSeat=preferences.seat.seated && !initialLook
    ? sofaSeats.find(item=>item.id===preferences.seat.slot) || sofaSeats[0] : null;
  let incomingGesture=null, outgoingGesture=null, lastGestureId='';
  let seatMotion = null;
  const bedrooms=[[0,lynnBed],[davidRoomX,davidBed]].map(([offset,[left,right,back,front]])=>{
    const x=offset+(left+right)/2,z=(back+front)/2;
    return {
      entry:new THREE.Vector3(offset+left-.28,playerEyeHeight,z+.46),
      pillow:new THREE.Vector3(x+.51,1.13,z-.90)
    };
  });
  let nearBed=null, rest=null, lieWeight=0;
  let gaitPhase = 0, gaitWeight = 0, lateralSway = 0, verticalSway = 0, forwardSway = 0;
  let nearSofa = false;
  const keys = new Set();
  const moveStick=hud.querySelector(".room-joystick"),stickKnob=moveStick.firstElementChild;
  let stickPointer=null,stickX=0,stickY=0;
  const pointers = new Map();
  let lastFrame = performance.now();
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const pointer = new THREE.Vector2();
  const move = new THREE.Vector3();
  const hint = hud.querySelector('small');
  const locationBadge=document.createElement('span');
  locationBadge.className='room-location';
  hud.appendChild(locationBadge);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const updateSeatControls = () => {
    hud.classList.toggle('is-seated', seated);
    seatButton.textContent = seated ? '起身' : camera.position.z>4.93?'坐上阳台长椅':'坐上沙发';
    canvas.setAttribute('aria-label', seated ? (activeSeat?.terrace?'坐在阳台长椅上。拖动环顾，按 E 起身。':'坐在沙发上。拖动环顾，按 E 起身。') : '3D 照片房间。点击后使用 W A S D 移动，拖动查看四周，按 E 查看照片或坐上沙发。');
  };
  const saveSeat=()=>{
    if (!activeSeat) return;
    if (seated) seatView={yaw:yaw%(Math.PI*2),pitch,fov:fovTarget};
    preferences.seat={view:seatView,seated,slot:activeSeat.id};
    storeRoomPreferences(options.theme,preferences,'seat');
  };
  const saveViewIfSeated=()=>{if(seated) saveSeat();};
  const removeGaitOffset=()=>{
    camera.position.x-=lateralSway;
    camera.position.y-=verticalSway;
    camera.position.z-=forwardSway;
    lateralSway=verticalSway=forwardSway=0;
  };
  const guestName=()=>latestPeer?.role==='david' ? 'David' : 'Lynn';
  function freeSeat(roomName,terrace=camera.position.z>4.93) {
    return sofaSeats.filter(item=>item.room===roomName && !!item.terrace===terrace && item.sofa.model && item.id!==latestPeer?.seat)
      .sort((a,b)=>a.exit.distanceToSquared(camera.position)-b.exit.distanceToSquared(camera.position))[0];
  }
  function releaseSeat() {
    activeSeat=null;
    presence?.setSeat(null);
  }
  function moveToSeat(item, sit, resume=false) {
    removeGaitOffset();
    gaitWeight=0;
    if (!sit) saveViewIfSeated();
    activeSeat=item;
    seated=sit;
    keys.clear();
    resetStick();
    smoothForward=smoothSideways=0;
    if (sit) {
      const useSaved=resume && preferences.seat.slot===item.id;
      if (!useSaved) seatView=null;
      yaw=seatView?.yaw ?? (item.terrace?Math.PI:item.room==='david' ? Math.PI-.45 : Math.PI+.32);
      pitch=seatView?.pitch ?? -.045;
      fovTarget=seatView?.fov ?? roomFov;
    }
    const destination=sit ? item.eye : item.exit;
    if (reducedMotion) {
      camera.position.copy(destination);
    } else {
      seatMotion={from:camera.position.clone(),to:destination,elapsed:0};
    }
    updateSeatControls();
    saveSeat();
    if (!sit && !seatMotion) releaseSeat();
    canvas.focus({preventScroll:true});
  }
  function requestSeat(item,resume=false) {
    if (!item || rest || seatMotion || pendingSeat) return;
    if (!presence) {
      moveToSeat(item,true,resume);
      return;
    }
    pendingSeat={item,resume,attempts:0};
    presence.setSeat(item.id);
  }
  function settleSeat(id) {
    if (pendingSeat) {
      const {item,resume,attempts}=pendingSeat;
      if (id===item.id) {
        pendingSeat=null;
        moveToSeat(item,true,resume);
        return;
      }
      const other=id===null && !attempts && freeSeat(item.room,!!item.terrace);
      if (other && other!==item) {
        pendingSeat={item:other,resume:false,attempts:1};
        presence.setSeat(other.id);
        return;
      }
      pendingSeat=null;
      presence.setSeat(null);
      return;
    }
    if (seated && id===null) {
      seatMotion=null;
      moveToSeat(activeSeat,false);
    }
  }
  function toggleSeat(roomName=suiteZone(camera.position.x)) {
    if (rest || pendingSeat || seatMotion) return;
    if (seated) moveToSeat(activeSeat,false);
    else requestSeat(freeSeat(roomName));
  }
  const toggleBed=()=>{
    if (rest && rest.progress<1) return;
    if (rest) {
      rest.direction=-1;
      rest.exitFrom={yaw,pitch};
    } else {
      if (!nearBed || seated || seatMotion || pendingSeat) return;
      removeGaitOffset();
      rest={bed:nearBed,from:camera.position.clone(),yaw,pitch,progress:0,direction:1};
    }
    keys.clear();resetStick();
    smoothForward=smoothSideways=gaitWeight=0;
    canvas.focus({preventScroll:true});
  };

  const updateBed=delta=>{
    const {bed,from,direction,exitFrom}=rest;
    rest.progress=reducedMotion ? (direction>0 ? 1 : 0)
      : THREE.MathUtils.clamp(rest.progress+direction*delta/1.38,0,1);
    const t=rest.progress;
    const approach=THREE.MathUtils.smoothstep(t,0,.28);
    lieWeight=THREE.MathUtils.smoothstep(t,.28,1);
    if (t<.28) camera.position.lerpVectors(from,bed.entry,approach);
    else {
      camera.position.lerpVectors(bed.entry,bed.pillow,lieWeight);
      camera.position.y-=.16*Math.sin(Math.PI*lieWeight);
    }
    const targetYaw=exitFrom?.yaw ?? Math.PI;
    const turn=THREE.MathUtils.euclideanModulo(targetYaw-rest.yaw+Math.PI,2*Math.PI)-Math.PI;
    yaw=rest.yaw+turn*approach;
    pitch=THREE.MathUtils.lerp(rest.pitch,exitFrom?.pitch ?? .48,lieWeight);
    if(direction>0 && t===1) rest.direction=0;
    if(direction<0 && t===0) {
      rest=null;
      updateSeatControls();
    }
  };
  const obstacles = [windowBenchBounds,lynnBed,...davidObstacles.map(([left,right,near,far])=>[left+davidRoomX,right+davidRoomX,near,far])];
  if (season) obstacles.push(season.obstacle);
  if (owned.has('bed')) obstacles.push([-6.19,-2.52,-.36,1.53]);
  if (owned.has('lamp')) obstacles.push([-6.35,-5.45,1.78,3.05]);
  if (owned.has('outfit')) obstacles.push([-5.1,-3.4,1.75,3.1]);
  if (owned.has('plant')) obstacles.push([4.65,5.72,1.62,3.05]);
  const openDoors={lynn:false,david:false};
  const passableDoors={lynn:false,david:false};
  let nearBalcony=null;
  const balconyButton=document.createElement('button');
  balconyButton.type='button';
  balconyButton.className='room-balcony-action room-light-trigger';
  balconyButton.hidden=true;
  hud.appendChild(balconyButton);
  function inDoorway(x,z,zone) {
    const local=x-(zone==='david' ? davidRoomX : 0);
    return z>4.06 && z<4.91 && local>doorLeft-.07 && local<doorRight+.07;
  }
  function occupiedDoor(zone) {
    return inDoorway(camera.position.x,camera.position.z,zone)
      || (peerPose && inDoorway(peerPose[0],peerPose[2],zone));
  }
  function toggleBalcony() {
    if (!nearBalcony || (openDoors[nearBalcony] && occupiedDoor(nearBalcony))) return;
    openDoors[nearBalcony]=!openDoors[nearBalcony];
    presence?.setDoor(nearBalcony,openDoors[nearBalcony]);
    canvas.focus({preventScroll:true});
  }
  let remote=null, remoteTag=null, latestPeer=null, peerLoad=null, retryPeerAfter=0, peerPose=null;
  const remoteView={position:new THREE.Vector3()};
  const peerBadge=document.createElement('span');
  peerBadge.className='room-location room-peer-status';
  peerBadge.setAttribute('role','status');
  peerBadge.hidden=!options.exchange;
  hud.appendChild(peerBadge);
  const thresholds=mountThreshold({scene,stage,hud,canvas,box,camera,snow:options.theme==='christmas',shared:!!options.exchange,
    peer:()=>latestPeer?.pose?{x:latestPeer.pose[0],z:latestPeer.pose[2]}:null,
    change:(key,open)=>presence?.setDoor(key,open),
    gesture:g=>presence?.sendGesture(g),previewInk:m=>presence?.previewInk(m),
    send:m=>presence?.addMark(m),shadow:()=>{renderer.shadowMap.needsUpdate=true;}
  });
  const board=mountHallBoard({scene,stage,hud,camera,canvas,box,role:options.role||'lynn',shared:!!options.exchange,send:op=>presence?.addBoard(op)});
  const corners=mountRoomCorners({scene,stage,hud,tools:sceneTools,camera,canvas,box,role:options.role||'lynn',photos:options.photoCatalog||options.photos||[],loadPhotoURL:options.loadPhotoURL,
    shared:!!options.exchange,onPhoto:options.onPhoto,dusk,send:op=>presence?.setCorner(op),publish:cues=>presence?.setCues(cues)});
  const presence=options.exchange ? mountRoomPresence(options.exchange,{
    onPeer(peer) {
      latestPeer=peer;corners.peer(peer?.cues);thresholds.receiveInk(peer?.ink || null);
      if (!peer) incomingGesture=null;
      if (peer?.gesture && peer.gesture.id!==lastGestureId) {
        lastGestureId=peer.gesture.id;
        if(/^(bell|knock)-/.test(peer.gesture.kind))thresholds.receiveDoor(peer.gesture);
        else incomingGesture={...peer.gesture,at:performance.now()};
      }
      if (!peer && remote?.root.visible) {
        remote.root.visible=false;
        peerPose=null;
        renderer.shadowMap.needsUpdate=true;
      }
    },
    onDoor(zone,open){if(zone.startsWith('entry-'))thresholds.set(zone.slice(6),open);else openDoors[zone]=open;},
    onMarks:thresholds.accept,onInkQueue:thresholds.queue,onBoard:board.accept,onBoardQueue:board.queue,onCorner:corners.state,outboxKey:options.outboxKey,
    onSeat:settleSeat,
    onStatus(label){peerBadge.textContent=label;}
  }) : null;

  const peerActions=document.createElement('div');
  peerActions.className='room-peer-actions';
  peerActions.hidden=true;
  peerActions.innerHTML=`<button type="button" class="room-light-trigger" data-wave title="G">挥手</button>
    <button type="button" class="room-light-trigger" data-point title="F">看这里</button>
    <button type="button" class="room-light-trigger" data-follow hidden>望过去</button>`;
  hud.appendChild(peerActions);
  const followButton=peerActions.querySelector('[data-follow]');
  const aimPoint=new THREE.Vector3();
  const gestureRay=new THREE.Raycaster();
  const noteMarker=document.createElement('span');
  noteMarker.className='room-point-marker';
  noteMarker.hidden=true;
  noteMarker.setAttribute('aria-hidden','true');
  hud.appendChild(noteMarker);
  const notice=document.createElement('output');
  notice.className='room-gesture-status';
  notice.setAttribute('aria-live','polite');
  hud.appendChild(notice);
  function sendGesture(kind) {
    if (!latestPeer || rest || seatMotion) return;
    gestureRay.setFromCamera(center,camera);
    const photo=kind==='point' && gestureRay.intersectObjects(photoTargets,false)[0];
    const point=photo?.distance<=12 ? photo.point : gestureRay.ray.at(68,aimPoint);
    const gesture={id:crypto.randomUUID?.() || 'gesture-'+Date.now()+'-'+Math.random().toString(36).slice(2),kind};
    if (kind==='point') gesture.target=point.toArray();
    outgoingGesture={...gesture,at:performance.now()};
    presence.sendGesture(gesture);
    canvas.focus({preventScroll:true});
  }
  peerActions.querySelector('[data-wave]').onclick=()=>sendGesture('wave');
  peerActions.querySelector('[data-point]').onclick=()=>sendGesture('point');
  followButton.onclick=()=>{
    if (!incomingGesture?.target) return;
    aimPoint.fromArray(incomingGesture.target).sub(camera.position);
    yaw=Math.atan2(-aimPoint.x,-aimPoint.z);
    pitch=THREE.MathUtils.clamp(Math.atan2(aimPoint.y,Math.hypot(aimPoint.x,aimPoint.z)),playerLookDown,.92);
    saveViewIfSeated();
    canvas.focus({preventScroll:true});
  };

  function updateRemote(delta,now) {
    if (!latestPeer) return;
    if (!remote) {
      if (peerLoad || now<retryPeerAfter) return;
      const name=latestPeer.role==='david' ? 'David' : 'Lynn';
      peerLoad=loadRealModel(scene,characterAsset,{
        name:'remote-character',targetHeight:1.68,preciseBounds:true,
        canAttach:()=>!destroyed && stage.isConnected && !!latestPeer
      }).then(model=>{
        if (!model) return;
        remote=bindRoomPlayer(model,false);
        remoteTag=new THREE.Sprite(new THREE.SpriteMaterial({
          map:canvasTexture(320,82,(ctx,w,h)=>{
            ctx.fillStyle='#342a42dd';ctx.beginPath();ctx.roundRect(4,4,w-8,h-8,36);ctx.fill();
            ctx.fillStyle='#fffbf3';ctx.font='700 49px system-ui';
            ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,w/2,h/2);
          }),depthWrite:false
        }));
        remoteTag.position.set(0,1.89,0);
        remoteTag.scale.set(.72,.185,1);
        remote.root.add(remoteTag);
        remote.root.visible=false;
      }).catch(()=>{retryPeerAfter=performance.now()+6000;})
        .finally(()=>{peerLoad=null;});
      return;
    }
    const target=latestPeer.pose;
    const lie=target[7] ?? 0;
    if (!peerPose || Math.hypot(target[0]-peerPose[0],target[2]-peerPose[2])>3) peerPose=[...target.slice(0,7),lie];
    const blend=1-Math.exp(-delta*4);
    const dx=(target[0]-peerPose[0])*blend, dz=(target[2]-peerPose[2])*blend;
    for(const i of [0,1,2,6]) peerPose[i]=THREE.MathUtils.lerp(peerPose[i],target[i],blend);
    peerPose[7]=THREE.MathUtils.lerp(peerPose[7],lie,blend);
    if(Math.abs(peerPose[7]-lie)<.002) peerPose[7]=lie;
    const turn=THREE.MathUtils.euclideanModulo(target[3]-peerPose[3]+Math.PI,2*Math.PI)-Math.PI;
    peerPose[3]+=turn*blend;
    // Integrate the visible travel between updates so footsteps keep moving forward through a phase wrap.
    const distance=Math.hypot(dx,dz);
    const cos=Math.cos(peerPose[3]),sin=Math.sin(peerPose[3]);
    const forward=distance>.0001 ? -(dx*sin+dz*cos)/distance : 0;
    const sideways=distance>.0001 ? (dx*cos-dz*sin)/distance : 0;
    peerPose[4]=(peerPose[4]+distance*Math.PI/stepLength)%(2*Math.PI);
    const pace=lie>0 || peerPose[7]>0 || target[6]>.01 ? 0 : Math.min(1,distance/Math.max(.001,delta*1.53));
    peerPose[5]=THREE.MathUtils.lerp(peerPose[5],pace,1-Math.exp(-delta*10));
    remoteView.position.set(peerPose[0],peerPose[1],peerPose[2]);
    remote.root.visible=true;
    remoteTag.position.set(0,1.89-.33*peerPose[7],.48*peerPose[7]);
    if(remote.update(remoteView,peerPose[3],peerPose[4],peerPose[5],peerPose[6],forward,now,peerPose[7],sideways,
      sofaSeats.find(item=>item.id===latestPeer.seat)?.facing,incomingGesture)) {
      renderer.shadowMap.needsUpdate=true;
    }
  }

  const blocked = (x, z) => thresholds.blocked(x,z) || !canWalkSuite(x,z,passableDoors) || obstacles.some(([x1,x2,z1,z2]) => x > x1 && x < x2 && z > z1 && z < z2);
  const moveCamera = (forward, sideways, amount) => {
    if (!forward && !sideways) return 0;
    const x = camera.position.x, z = camera.position.z;
    move.set(sideways * Math.cos(yaw) - forward * Math.sin(yaw), 0, -forward * Math.cos(yaw) - sideways * Math.sin(yaw));
    if (move.lengthSq() > 1) move.normalize();
    move.multiplyScalar(amount);
    const nextX = camera.position.x + move.x, nextZ = camera.position.z + move.z;
    if (!blocked(nextX, camera.position.z)) camera.position.x = nextX;
    if (!blocked(camera.position.x, nextZ)) camera.position.z = nextZ;
    return Math.hypot(camera.position.x-x,camera.position.z-z);
  };

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.round(rect.width));
    const nextHeight = Math.max(1, Math.round(rect.height));
    const fullQuality = !mobile && windowQuality.uhd && document.fullscreenElement === stage;
    const pixelBudget = fullQuality ? 3840 * 2160 : mobile || !windowQuality.hd ? 1_650_000 : 4_150_000;
    const density = devicePixelRatio || 1;
    const renderDensity = fullQuality && windowQuality.tiles ? Math.max(density,1.30) : density;
    const ratio = Math.min(fullQuality ? renderDensity : Math.min(density,mobile ? 1.55 : windowQuality.hd ? 2.25 : 1.85),
      Math.sqrt(pixelBudget / (nextWidth * nextHeight)));
    if (nextWidth === width && nextHeight === height && renderer.getPixelRatio() === ratio) return;
    width = nextWidth; height = nextHeight;
    stage.style.setProperty('--room-stage-height',height+'px');
    // Limit pixel count on high-density devices while keeping hardware edge smoothing.
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    for(const snow of snowfall) snow.pixels.value=height*ratio;
    fireworks?.resize(height*ratio);
    teaSteam?.resize(height*ratio);
    season?.motion?.resize(height*ratio);
    davidSeason?.motion?.resize(height*ratio);
    camera.aspect = width / height;
    camera.zoom = Math.max(1,camera.aspect/(16/9));
    camera.updateProjectionMatrix();
  };

  const draw = now => {
    if (destroyed || !visible || !valley.ready || document.hidden || document.body.classList.contains('message-open')) { frame = 0; return; }
    resize();
    const elapsed = Math.max(0, (now - lastFrame) / 1000);
    const delta = Math.min(.05,elapsed);
    lastFrame = now;
    corners.step();dusk?.step(Math.min(1,elapsed));
    removeGaitOffset();
    const forward = THREE.MathUtils.clamp((keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)-stickY,-1,1);
    const sideways = THREE.MathUtils.clamp((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0)+stickX,-1,1);
    const easing = 1 - Math.exp(-delta * 11);
    smoothForward = THREE.MathUtils.lerp(smoothForward, forward, easing);
    smoothSideways = THREE.MathUtils.lerp(smoothSideways, sideways, easing);
    const beforeX=camera.position.x,beforeZ=camera.position.z;
    let walked = 0,walkForward=0,walkSideways=0;
    const resting=!!rest;
    if (rest) {
      if (rest.direction) updateBed(delta);
    } else if (seatMotion) {
      seatMotion.elapsed += delta;
      const progress = THREE.MathUtils.smoothstep(seatMotion.elapsed, 0, .34);
      camera.position.lerpVectors(seatMotion.from, seatMotion.to, progress);
      if (progress===1) {
        seatMotion=null;
        if(!seated) releaseSeat();
      }
    } else if (!seated && !pendingSeat && !thresholds.drawing()) {
      walked = moveCamera(smoothForward*(smoothForward<0 ? 1.17/1.53 : 1),smoothSideways*1.22/1.53,delta*1.53);
      if(walked>.00001) {
        const dx=(camera.position.x-beforeX)/walked,dz=(camera.position.z-beforeZ)/walked;
        walkForward=-dx*Math.sin(yaw)-dz*Math.cos(yaw);
        walkSideways=dx*Math.cos(yaw)-dz*Math.sin(yaw);
      }
    }
    if (!seated && !seatMotion && !resting) {
      // Drive the step cycle from distance actually walked. There is no bob
      // while pushing against a wall, standing still, or sitting down.
      const pace=delta>0 ? THREE.MathUtils.clamp(walked/(delta*1.53),0,1) : 0;
      gaitWeight=THREE.MathUtils.lerp(gaitWeight,pace,1-Math.exp(-delta*(pace>gaitWeight?8:13)));
      gaitPhase=(gaitPhase + walked*Math.PI/stepLength)%(Math.PI*2);
      if (gaitWeight<.004) gaitWeight=0;
      const headWeight=reducedMotion ? 0 : gaitWeight;
      const sway=Math.sin(gaitPhase)*headWeight*.012;
      lateralSway=Math.cos(yaw)*sway;
      forwardSway=-Math.sin(yaw)*sway;
      verticalSway=(.014*Math.cos(2*gaitPhase)-.003*Math.sin(4*gaitPhase))*headWeight;
      camera.position.x+=lateralSway;
      camera.position.y+=verticalSway;
      camera.position.z+=forwardSway;
    } else {
      gaitWeight=0;
    }
    camera.fov = THREE.MathUtils.lerp(camera.fov, fovTarget, 1 - Math.exp(-delta * 10));
    camera.updateProjectionMatrix();
    camera.rotation.y = yaw;
    camera.rotation.x = pitch + (reducedMotion ? 0 : Math.sin(2*gaitPhase-.45)*gaitWeight*.0018);
    camera.rotation.z = reducedMotion ? 0 : Math.sin(gaitPhase+.35)*gaitWeight*.0022;
    const seatWeight = seatMotion
      ? THREE.MathUtils.clamp((playerEyeHeight-camera.position.y)/playerSeatDrop,0,1)
      : Number(seated);
    if (player?.update(camera,yaw,gaitPhase,gaitWeight,seatWeight,walkForward,now,lieWeight,walkSideways,activeSeat?.facing,outgoingGesture)) {
      renderer.shadowMap.needsUpdate=true;
    }
    if (clockCandle && lightState['new-year-candle'] && !reducedMotion) {
      const t = now * .001;
      const shimmer = .973 + .018 * Math.sin(t * 4.1) + .009 * Math.sin(t * 7.6);
      const level = (dim / 100) * shimmer;
      clockCandle.material.emissiveIntensity = clockCandle.onIntensity * level;
      const [{light,power}] = clockCandle.sources;
      light.intensity = power * level;
    }
    if(!reducedMotion) for(const snow of snowfall) snow.elapsed.value+=delta;
    const remaining = Math.abs(darkTarget-darkLevel);
    if (remaining > .001) {
      darkLevel = reducedMotion ? darkTarget : THREE.MathUtils.lerp(darkLevel,darkTarget,1-Math.exp(-delta*4.2));
      updateNaturalLight(darkLevel);
    }
    if (fireworks && (!reducedMotion || !fireworksPainted)) {
      fireworksTime += Math.min(.135,elapsed);
      fireworks.update(fireworksTime,!reducedMotion,darkLevel);
      fireworksPainted = true;
    }
    if (!reducedMotion) {
      steamTime += Math.min(.12,elapsed);
      teaSteam?.update(steamTime,darkLevel);
      season?.motion?.update(steamTime,darkLevel);
      davidSeason?.motion?.update(steamTime,darkLevel);
      if (dust) {
        dust.rotation.y = Math.sin(now * .00007) * .025;
        dust.position.y = Math.sin(now * .00016) * .025;
      }
    }
    camera.updateMatrixWorld();
    raycaster.setFromCamera(center, camera);
    const hit = raycaster.intersectObjects(photoTargets, false)[0];
    nearPhoto = hit && hit.distance <= 3.6 ? hit.object.userData.photo : null;
    const zone=suiteZone(camera.position.x);
    const available=freeSeat(zone);
    nearSofa=!rest && !seated && available && available.exit.distanceTo(camera.position)<2.25;
    if (incomingGesture && now-incomingGesture.at>5400) incomingGesture=null;
    const pointing=incomingGesture?.kind==='point';
    peerActions.hidden=!latestPeer || !!rest;
    followButton.hidden=!pointing;
    const gestureLabel=incomingGesture ? `${guestName()}${pointing ? ' 想给你看这里' : ' 在向你挥手'}` : '';
    if(notice.value!==gestureLabel) notice.value=gestureLabel;
    noteMarker.hidden=true;
    if(pointing) {
      aimPoint.fromArray(incomingGesture.target);
      if(gestureRay.ray.direction.set(0,0,-1).applyQuaternion(camera.quaternion)
        .dot(gestureRay.ray.origin.copy(aimPoint).sub(camera.position))>0) {
        aimPoint.project(camera);
        if(Math.abs(aimPoint.x)<.97 && Math.abs(aimPoint.y)<.94) {
          noteMarker.hidden=false;
          noteMarker.style.left=(50+50*aimPoint.x)+'%';
          noteMarker.style.top=(50-50*aimPoint.y)+'%';
        }
      }
    }
    const pose=[
      camera.position.x-lateralSway,camera.position.y-verticalSway,camera.position.z-forwardSway,yaw%(Math.PI*2),gaitPhase,gaitWeight,seatWeight
    ];
    if(lieWeight>0) pose.push(lieWeight);
    presence?.sample(pose.map(value=>Math.round(value*1000)/1000));
    updateRemote(delta,now);
    if(restoreSeat?.sofa.model) {
      const remembered=restoreSeat;
      restoreSeat=null;
      if(!rest && !seated) {
        camera.position.copy(remembered.exit);
        requestSeat(freeSeat(remembered.room),true);
      }
    }
    for (const [label,door] of Object.entries(balconyDoors)) {
      const clear=Boolean(openDoors[label] || occupiedDoor(label));
      const target=clear ? -(doorRight-doorLeft) : 0;
      const prev=door.position.x;
      door.position.x=reducedMotion ? target : THREE.MathUtils.lerp(prev,target,1-Math.exp(-delta*11));
      if(Math.abs(door.position.x-target)<.008) door.position.x=target;
      passableDoors[label]=clear && door.position.x < target+.16;
      if (Math.abs(prev-door.position.x)>.012) renderer.shadowMap.needsUpdate=true;
    }
    const localX=camera.position.x-(zone==='david' ? davidRoomX : 0);
    nearBalcony=zone!=='hall' && camera.position.z>3.12 && camera.position.z<5.98
      && localX>doorLeft-1.28 && localX<doorRight+1.10 && !seated ? zone : null;
    thresholds.step(delta,!rest&&!seated&&!seatMotion);board.step(!rest&&!seated&&!seatMotion,hallLight.intensity/14);
    balconyButton.hidden=!nearBalcony;
    balconyButton.disabled=!!nearBalcony && openDoors[nearBalcony] && occupiedDoor(nearBalcony);
    const doorLabel=nearBalcony && openDoors[nearBalcony] ? '关闭阳台门' : '打开阳台门';
    if(balconyButton.textContent!==doorLabel) balconyButton.textContent=doorLabel;
    if(stage.dataset.roomZone!==zone) stage.dataset.roomZone=zone;
    const locationName=camera.position.z>4.92 ? (zone==='david' ? 'David 的阳台' : 'Lynn 的阳台')
      : {lynn:'Lynn 的房间',hall:'连接走廊',david:'David 的房间'}[zone];
    if(locationBadge.textContent!==locationName) locationBadge.textContent=locationName;
    nearBed=!rest && !seated && !seatMotion
      ? bedrooms.find(bed=>camera.position.x<bed.entry.x+.22 && bed.entry.distanceTo(camera.position)<1.25)
      : null;
    seatButton.hidden=!!rest || (!seated && !pendingSeat && !nearSofa);
    seatButton.disabled=!!(pendingSeat || seatMotion);
    const onTerrace=camera.position.z>4.93;
    const together=latestPeer?.seat?.startsWith(zone+'-')&&latestPeer.seat.includes('-terrace-')===onTerrace;
    const seatLabel=seated ? '起身' : pendingSeat ? '正在找座位…' : together ? `坐在 ${guestName()} 旁边` : onTerrace?'坐上阳台长椅':'坐上沙发';
    if(seatButton.textContent!==seatLabel) seatButton.textContent=seatLabel;
    bedButton.hidden = !rest && !nearBed;
    bedButton.disabled = !!rest?.direction;
    const bedLabel=rest ? (rest.direction>0 ? '正在上床…' : rest.direction<0 ? '正在起身…' : '起身') : '躺到床上';
    if(bedButton.textContent!==bedLabel) bedButton.textContent=bedLabel;
    hud.classList.toggle('is-resting',!!rest);
    hud.classList.toggle('can-open', !!nearPhoto || nearSofa || !!nearBed);
    const prompt = rest ? '拖动环顾 · 按 E 起身'
      : nearBed ? '按 E 或点击按钮躺下'
      : nearPhoto ? '按 E 或点击，查看这张照片'
      : seated ? (mobile ? '拖动环顾' : '拖动环顾 · 按 E 起身')
      : nearSofa ? (camera.position.z>4.93?'按 E 或点击按钮坐上阳台长椅':'按 E 或点击沙发坐下')
      : nearBalcony ? (balconyButton.disabled ? '等门口的人走开，就可以关门' : '按 E 或点击按钮操作阳台门')
      : zone==='hall' ? '沿走廊可在两间房之间通行'
      : zone==='lynn' && camera.position.x < -3.7 && camera.position.z < -.95 ? '走廊通往 David 的房间'
      : '点击照片查看 · 走近也可按 E';
    if (hint.textContent !== prompt) hint.textContent = prompt;
    valley.update(camera,duskPhase.value,now);
    renderer.render(scene, camera);
    if (splash.isConnected) {
      stage.dataset.roomBackdrop='ready';
      stage.removeAttribute('aria-busy');
      canvas.style.visibility=hud.style.visibility='';
      splash.remove();
    }
    frame = requestAnimationFrame(draw);
  };

  const start = () => { if (!frame && !destroyed) { lastFrame = performance.now(); frame = requestAnimationFrame(draw); } };
  const openFocusedPhoto = () => { if (nearPhoto) options.onPhoto?.(nearPhoto); };
  const onPointerDown = event => {
    canvas.focus({preventScroll:true});
    if(thresholds.drawing())return;
    if(!pointers.size && thresholds.directStart(event)){
      gaitWeight=0;smoothForward=smoothSideways=0;fovTarget=camera.fov;
      canvas.setPointerCapture(event.pointerId);event.preventDefault();return;
    }
    pointers.set(event.pointerId, [event.clientX,event.clientY]);
    if (pointers.size === 2) {
      const points=[...pointers.values()];
      pinchDistance=Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]);
    }
    canvas.setPointerCapture?.(event.pointerId);
    dragging = true; dragged = false; dragX = event.clientX; dragY = event.clientY;
    canvas.classList.add('is-dragging');
  };
  const onPointerMove = event => {
    if(thresholds.directMove(event)||thresholds.drawing())return;
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId,[event.clientX,event.clientY]);
    if (pointers.size === 2) {
      const points=[...pointers.values()];
      const distance=Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]);
      if (pinchDistance) fovTarget=THREE.MathUtils.clamp(fovTarget-(distance-pinchDistance)*.055,46,74);
      pinchDistance=distance; dragged=true; return;
    }
    if (!dragging) return;
    const dx = event.clientX - dragX, dy = event.clientY - dragY;
    if (Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
    yaw -= dx * .0038;
    pitch = THREE.MathUtils.clamp(pitch - dy * .0034, playerLookDown, .92);
    dragX = event.clientX; dragY = event.clientY;
  };
  const onLostInk=event=>thresholds.directEnd(event);
  const onPointerUp = event => {
    if(thresholds.directEnd(event)||!pointers.has(event.pointerId))return;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance=0;
    if (event.type === 'pointerup' && !dragged && pointers.size === 0) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
      raycaster.setFromCamera(pointer, camera);
      if(board.interact(pointer.x,pointer.y)||corners.interact(pointer.x,pointer.y)){dragging=false;canvas.classList.remove('is-dragging');return;}
      const sofa=sofas[suiteZone(camera.position.x)]?.model;
      const sofaHit=!seated && sofa && raycaster.intersectObject(sofa,true)[0];
      const hit=raycaster.intersectObjects([...fixtures,...photoTargets],false)[0];
      if(sofaHit && sofaHit.distance<3.15 && (!hit || sofaHit.distance<hit.distance)) toggleSeat();
      else if(hit?.object.userData.lightKey && hit.distance<=9) {
        const key=hit.object.userData.lightKey; lightState[key]=!lightState[key];applyLightState(true);
      } else if(hit?.object.userData.photo) options.onPhoto?.(hit.object.userData.photo);
    }
    dragging = pointers.size > 0;
    if (dragging) {
      const remaining=[...pointers.values()][0];
      dragX=remaining[0]; dragY=remaining[1];
    } else {
      canvas.classList.remove('is-dragging');
      if (dragged) saveViewIfSeated();
    }
    canvas.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = event => {
    if(thresholds.drawing()){event.preventDefault();return;}
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) {
      keys.add(event.code);
      event.preventDefault();
    }
    if (event.repeat) return;
    if (['KeyG','KeyF'].includes(event.code)) {
      sendGesture(event.code==='KeyG' ? 'wave' : 'point');
      event.preventDefault();
    } else if (event.code === 'KeyE') {
      if (seated) toggleSeat();
      else if (rest || nearBed) toggleBed();
      else if (board.interact() || thresholds.toggleNear()) {}
      else if (nearBalcony) toggleBalcony();
      else if (nearPhoto) openFocusedPhoto();
      else if (seated || nearSofa) toggleSeat();
      event.preventDefault();
    } else if (event.code === 'Escape' && (seated || rest) && document.fullscreenElement !== stage) {
      if(rest) toggleBed(); else toggleSeat();
      event.preventDefault();
    }
  };
  const onKeyUp = event => keys.delete(event.code);
  const onBlur = () => { keys.clear(); resetStick(); };
  const onWheel = event => {
    if(thresholds.drawing()){event.preventDefault();return;}
    fovTarget = THREE.MathUtils.clamp(fovTarget + Math.sign(event.deltaY) * 3.5, 46, 74);
    saveViewIfSeated();
    event.preventDefault();
  };
  function resetStick(){
    const id=stickPointer;stickPointer=null;stickX=stickY=0;
    stickKnob.style.transform='translate(0,0)';
    if(id!==null&&moveStick.hasPointerCapture(id))moveStick.releasePointerCapture(id);
  }
  function moveJoystick(e){
    if(e.pointerId!==stickPointer)return;
    const b=moveStick.getBoundingClientRect(),r=b.width*.31;
    const dx=(e.clientX-b.left-b.width/2)/r,dy=(e.clientY-b.top-b.height/2)/r;
    const dist=Math.hypot(dx,dy),power=Math.max(0,(Math.min(1,dist)-.16)/.84);
    stickX=dist?dx/dist*power:0;stickY=dist?dy/dist*power:0;
    const limit=Math.max(1,dist);
    stickKnob.style.transform=`translate(${dx*r/limit}px,${dy*r/limit}px)`;
    e.preventDefault();
  }
  const startStick=e=>{
    if(stickPointer!==null||seated||rest||seatMotion||e.button>0)return;
    stickPointer=e.pointerId;moveStick.setPointerCapture(e.pointerId);moveJoystick(e);
  };
  const endStick=e=>{if(e.pointerId===stickPointer)resetStick();};
  const stickEvents=[['pointerdown',startStick],['pointermove',moveJoystick],['pointerup',endStick],['pointercancel',endStick],['lostpointercapture',endStick]];
  const onVisibility = () => { if(document.hidden)resetStick(); if (!document.hidden) { lastFrame=performance.now(); start(); } };
  const persistRoom = () => { saveViewIfSeated(); dusk?.persist(); };
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === stage) await document.exitFullscreen();
      else {
        await stage.requestFullscreen();
        canvas.focus({preventScroll:true});
      }
    } catch (_) {
      fullscreenButton.setAttribute('title','此浏览器暂时无法全屏');
    }
  };
  const onFullscreenChange = () => {
    const active = document.fullscreenElement === stage;
    fullscreenButton.setAttribute('aria-pressed',String(active));
    fullscreenButton.textContent = active ? '退出全屏' : '全屏';
    resize();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('lostpointercapture',onLostInk);
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('blur', onBlur);
  canvas.addEventListener('wheel', onWheel, {passive:false});
  seatButton.onclick=()=>toggleSeat();
  bedButton.addEventListener('click',toggleBed);
  balconyButton.addEventListener('click',toggleBalcony);
  fullscreenButton.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  for(const [type,handler] of stickEvents)moveStick.addEventListener(type,handler);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('lynn-mailbox-visibility',onVisibility);
  window.addEventListener('pagehide',persistRoom);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0]?.isIntersecting ?? true;
    if (visible) start();
    else if (frame) { cancelAnimationFrame(frame); frame = 0; }
  }, {rootMargin:'160px'});
  intersection.observe(stage);
  resize();
  stage.closest('.monster-room')?.classList.add('room-3d-ready');
  start();

  return {
    destroy() {
      saveViewIfSeated();
      dusk?.destroy();
      ambience?.destroy();
      destroyed = true;
      thresholds.destroy();board.destroy();corners.destroy();
      presence?.destroy();
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('lostpointercapture',onLostInk);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('blur', onBlur);
      canvas.removeEventListener('wheel', onWheel);
      seatButton.onclick=null;
      bedButton.removeEventListener('click',toggleBed);
      balconyButton.removeEventListener('click',toggleBalcony);
      fullscreenButton.removeEventListener('click', toggleFullscreen);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      if (document.fullscreenElement === stage) document.exitFullscreen().catch(() => {});
      resetStick();for(const [type,handler] of stickEvents)moveStick.removeEventListener(type,handler);
      lightTrigger.removeEventListener('click',toggleLightPanel);
      lightPanel.removeEventListener('change',changeLight);
      lightPanel.removeEventListener('keydown',escapePanel);
      document.removeEventListener('pointerdown',dismissPanel);
      dimmer.removeEventListener('input',changeBrightness);
      lightSceneButtons.forEach(button=>button.removeEventListener('click',chooseLightScene));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('lynn-mailbox-visibility',onVisibility);
      window.removeEventListener('pagehide',persistRoom);
      resizeObserver.disconnect();
      intersection.disconnect();
      disposeObject(scene);
      environment.dispose();
      valley.dispose();
      moonMap?.dispose();
      valleyMask.dispose();
      textures.forEach(texture => texture.dispose?.());
      renderer.dispose();
      renderer.forceContextLoss?.();
      stage.closest('.monster-room')?.classList.remove('room-3d-ready');
      stage.setAttribute('aria-hidden', 'true');
      stage.removeAttribute('aria-busy');
      delete stage.dataset.roomBackdrop;
      stage.replaceChildren();
    }
  };
}
