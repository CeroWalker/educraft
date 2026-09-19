import { Group, MeshStandardMaterial, DoubleSide, BoxGeometry, Mesh, FrontSide, Vector2, EventDispatcher, Vector3, MOUSE, TOUCH, Spherical, Quaternion, Ray, Plane, MathUtils, BufferGeometry, OrthographicCamera, Float32BufferAttribute, ShaderMaterial, UniformsUtils, WebGLRenderTarget, HalfFloatType, NoBlending, Clock, Color, Sprite, SpriteMaterial, CanvasTexture, NearestFilter, AmbientLight, PointLight, Scene, PerspectiveCamera, ColorManagement, WebGLRenderer, DepthTexture, FloatType, EquirectangularReflectionMapping, Texture, Object3D } from "./three.module-BHQsVLbw.js";
function setUVs(box, u, v, width, height, depth, textureWidth, textureHeight) {
  const toFaceVertices = (x1, y1, x2, y2) => [
    new Vector2(x1 / textureWidth, 1 - y2 / textureHeight),
    new Vector2(x2 / textureWidth, 1 - y2 / textureHeight),
    new Vector2(x2 / textureWidth, 1 - y1 / textureHeight),
    new Vector2(x1 / textureWidth, 1 - y1 / textureHeight)
  ];
  const top = toFaceVertices(u + depth, v, u + width + depth, v + depth);
  const bottom = toFaceVertices(u + width + depth, v, u + width * 2 + depth, v + depth);
  const left = toFaceVertices(u, v + depth, u + depth, v + depth + height);
  const front = toFaceVertices(u + depth, v + depth, u + width + depth, v + depth + height);
  const right = toFaceVertices(u + width + depth, v + depth, u + width + depth * 2, v + height + depth);
  const back = toFaceVertices(u + width + depth * 2, v + depth, u + width * 2 + depth * 2, v + height + depth);
  const uvAttr = box.attributes.uv;
  const uvRight = [right[3], right[2], right[0], right[1]];
  const uvLeft = [left[3], left[2], left[0], left[1]];
  const uvTop = [top[3], top[2], top[0], top[1]];
  const uvBottom = [bottom[0], bottom[1], bottom[3], bottom[2]];
  const uvFront = [front[3], front[2], front[0], front[1]];
  const uvBack = [back[3], back[2], back[0], back[1]];
  const newUVData = [];
  for (const uvArray of [uvRight, uvLeft, uvTop, uvBottom, uvFront, uvBack]) {
    for (const uv of uvArray) {
      newUVData.push(uv.x, uv.y);
    }
  }
  uvAttr.set(new Float32Array(newUVData));
  uvAttr.needsUpdate = true;
}
function setSkinUVs(box, u, v, width, height, depth) {
  setUVs(box, u, v, width, height, depth, 64, 64);
}
function setCapeUVs(box, u, v, width, height, depth) {
  setUVs(box, u, v, width, height, depth, 64, 32);
}
class BodyPart extends Group {
  constructor(innerLayer, outerLayer) {
    super();
    Object.defineProperty(this, "innerLayer", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: innerLayer
    });
    Object.defineProperty(this, "outerLayer", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: outerLayer
    });
    innerLayer.name = "inner";
    outerLayer.name = "outer";
  }
}
class SkinObject extends Group {
  constructor() {
    super();
    Object.defineProperty(this, "head", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "body", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "rightArm", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "leftArm", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "rightLeg", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "leftLeg", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "modelListeners", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: []
    });
    Object.defineProperty(this, "slim", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "_map", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: null
    });
    Object.defineProperty(this, "layer1Material", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "layer1MaterialBiased", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "layer2Material", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "layer2MaterialBiased", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.layer1Material = new MeshStandardMaterial({
      side: FrontSide
    });
    this.layer2Material = new MeshStandardMaterial({
      side: DoubleSide,
      transparent: true,
      alphaTest: 1e-5
    });
    this.layer1MaterialBiased = this.layer1Material.clone();
    this.layer1MaterialBiased.polygonOffset = true;
    this.layer1MaterialBiased.polygonOffsetFactor = 1;
    this.layer1MaterialBiased.polygonOffsetUnits = 1;
    this.layer2MaterialBiased = this.layer2Material.clone();
    this.layer2MaterialBiased.polygonOffset = true;
    this.layer2MaterialBiased.polygonOffsetFactor = 1;
    this.layer2MaterialBiased.polygonOffsetUnits = 1;
    const headBox = new BoxGeometry(8, 8, 8);
    setSkinUVs(headBox, 0, 0, 8, 8, 8);
    const headMesh = new Mesh(headBox, this.layer1Material);
    const head2Box = new BoxGeometry(9, 9, 9);
    setSkinUVs(head2Box, 32, 0, 8, 8, 8);
    const head2Mesh = new Mesh(head2Box, this.layer2Material);
    this.head = new BodyPart(headMesh, head2Mesh);
    this.head.name = "head";
    this.head.add(headMesh, head2Mesh);
    headMesh.position.y = 4;
    head2Mesh.position.y = 4;
    this.add(this.head);
    const bodyBox = new BoxGeometry(8, 12, 4);
    setSkinUVs(bodyBox, 16, 16, 8, 12, 4);
    const bodyMesh = new Mesh(bodyBox, this.layer1Material);
    const body2Box = new BoxGeometry(8.5, 12.5, 4.5);
    setSkinUVs(body2Box, 16, 32, 8, 12, 4);
    const body2Mesh = new Mesh(body2Box, this.layer2Material);
    this.body = new BodyPart(bodyMesh, body2Mesh);
    this.body.name = "body";
    this.body.add(bodyMesh, body2Mesh);
    this.body.position.y = -6;
    this.add(this.body);
    const rightArmBox = new BoxGeometry();
    const rightArmMesh = new Mesh(rightArmBox, this.layer1MaterialBiased);
    this.modelListeners.push(() => {
      rightArmMesh.scale.x = this.slim ? 3 : 4;
      rightArmMesh.scale.y = 12;
      rightArmMesh.scale.z = 4;
      setSkinUVs(rightArmBox, 40, 16, this.slim ? 3 : 4, 12, 4);
    });
    const rightArm2Box = new BoxGeometry();
    const rightArm2Mesh = new Mesh(rightArm2Box, this.layer2MaterialBiased);
    this.modelListeners.push(() => {
      rightArm2Mesh.scale.x = this.slim ? 3.5 : 4.5;
      rightArm2Mesh.scale.y = 12.5;
      rightArm2Mesh.scale.z = 4.5;
      setSkinUVs(rightArm2Box, 40, 32, this.slim ? 3 : 4, 12, 4);
    });
    const rightArmPivot = new Group();
    rightArmPivot.add(rightArmMesh, rightArm2Mesh);
    this.modelListeners.push(() => {
      rightArmPivot.position.x = this.slim ? -0.5 : -1;
    });
    rightArmPivot.position.y = -4;
    this.rightArm = new BodyPart(rightArmMesh, rightArm2Mesh);
    this.rightArm.name = "rightArm";
    this.rightArm.add(rightArmPivot);
    this.rightArm.position.x = -5;
    this.rightArm.position.y = -2;
    this.add(this.rightArm);
    const leftArmBox = new BoxGeometry();
    const leftArmMesh = new Mesh(leftArmBox, this.layer1MaterialBiased);
    this.modelListeners.push(() => {
      leftArmMesh.scale.x = this.slim ? 3 : 4;
      leftArmMesh.scale.y = 12;
      leftArmMesh.scale.z = 4;
      setSkinUVs(leftArmBox, 32, 48, this.slim ? 3 : 4, 12, 4);
    });
    const leftArm2Box = new BoxGeometry();
    const leftArm2Mesh = new Mesh(leftArm2Box, this.layer2MaterialBiased);
    this.modelListeners.push(() => {
      leftArm2Mesh.scale.x = this.slim ? 3.5 : 4.5;
      leftArm2Mesh.scale.y = 12.5;
      leftArm2Mesh.scale.z = 4.5;
      setSkinUVs(leftArm2Box, 48, 48, this.slim ? 3 : 4, 12, 4);
    });
    const leftArmPivot = new Group();
    leftArmPivot.add(leftArmMesh, leftArm2Mesh);
    this.modelListeners.push(() => {
      leftArmPivot.position.x = this.slim ? 0.5 : 1;
    });
    leftArmPivot.position.y = -4;
    this.leftArm = new BodyPart(leftArmMesh, leftArm2Mesh);
    this.leftArm.name = "leftArm";
    this.leftArm.add(leftArmPivot);
    this.leftArm.position.x = 5;
    this.leftArm.position.y = -2;
    this.add(this.leftArm);
    const rightLegBox = new BoxGeometry(4, 12, 4);
    setSkinUVs(rightLegBox, 0, 16, 4, 12, 4);
    const rightLegMesh = new Mesh(rightLegBox, this.layer1MaterialBiased);
    const rightLeg2Box = new BoxGeometry(4.5, 12.5, 4.5);
    setSkinUVs(rightLeg2Box, 0, 32, 4, 12, 4);
    const rightLeg2Mesh = new Mesh(rightLeg2Box, this.layer2MaterialBiased);
    const rightLegPivot = new Group();
    rightLegPivot.add(rightLegMesh, rightLeg2Mesh);
    rightLegPivot.position.y = -6;
    this.rightLeg = new BodyPart(rightLegMesh, rightLeg2Mesh);
    this.rightLeg.name = "rightLeg";
    this.rightLeg.add(rightLegPivot);
    this.rightLeg.position.x = -1.9;
    this.rightLeg.position.y = -12;
    this.rightLeg.position.z = -0.1;
    this.add(this.rightLeg);
    const leftLegBox = new BoxGeometry(4, 12, 4);
    setSkinUVs(leftLegBox, 16, 48, 4, 12, 4);
    const leftLegMesh = new Mesh(leftLegBox, this.layer1MaterialBiased);
    const leftLeg2Box = new BoxGeometry(4.5, 12.5, 4.5);
    setSkinUVs(leftLeg2Box, 0, 48, 4, 12, 4);
    const leftLeg2Mesh = new Mesh(leftLeg2Box, this.layer2MaterialBiased);
    const leftLegPivot = new Group();
    leftLegPivot.add(leftLegMesh, leftLeg2Mesh);
    leftLegPivot.position.y = -6;
    this.leftLeg = new BodyPart(leftLegMesh, leftLeg2Mesh);
    this.leftLeg.name = "leftLeg";
    this.leftLeg.add(leftLegPivot);
    this.leftLeg.position.x = 1.9;
    this.leftLeg.position.y = -12;
    this.leftLeg.position.z = -0.1;
    this.add(this.leftLeg);
    this.modelType = "default";
  }
  get map() {
    return this._map;
  }
  set map(newMap) {
    this._map = newMap;
    this.layer1Material.map = newMap;
    this.layer1Material.needsUpdate = true;
    this.layer1MaterialBiased.map = newMap;
    this.layer1MaterialBiased.needsUpdate = true;
    this.layer2Material.map = newMap;
    this.layer2Material.needsUpdate = true;
    this.layer2MaterialBiased.map = newMap;
    this.layer2MaterialBiased.needsUpdate = true;
  }
  get modelType() {
    return this.slim ? "slim" : "default";
  }
  set modelType(value) {
    this.slim = value === "slim";
    this.modelListeners.forEach((listener) => listener());
  }
  getBodyParts() {
    return this.children.filter((it) => it instanceof BodyPart);
  }
  setInnerLayerVisible(value) {
    this.getBodyParts().forEach((part) => part.innerLayer.visible = value);
  }
  setOuterLayerVisible(value) {
    this.getBodyParts().forEach((part) => part.outerLayer.visible = value);
  }
  resetJoints() {
    this.head.rotation.set(0, 0, 0);
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.head.position.y = 0;
    this.body.position.y = -6;
    this.body.position.z = 0;
    this.rightArm.position.x = -5;
    this.rightArm.position.y = -2;
    this.rightArm.position.z = 0;
    this.leftArm.position.x = 5;
    this.leftArm.position.y = -2;
    this.leftArm.position.z = 0;
    this.rightLeg.position.x = -1.9;
    this.rightLeg.position.y = -12;
    this.rightLeg.position.z = -0.1;
    this.leftLeg.position.x = 1.9;
    this.leftLeg.position.y = -12;
    this.leftLeg.position.z = -0.1;
  }
}
class CapeObject extends Group {
  constructor() {
    super();
    Object.defineProperty(this, "cape", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "material", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.material = new MeshStandardMaterial({
      side: DoubleSide,
      transparent: true,
      alphaTest: 1e-5
    });
    const capeBox = new BoxGeometry(10, 16, 1);
    setCapeUVs(capeBox, 0, 0, 10, 16, 1);
    this.cape = new Mesh(capeBox, this.material);
    this.cape.position.y = -8;
    this.cape.position.z = 0.5;
    this.add(this.cape);
  }
  get map() {
    return this.material.map;
  }
  set map(newMap) {
    this.material.map = newMap;
    this.material.needsUpdate = true;
  }
}
class ElytraObject extends Group {
  constructor() {
    super();
    Object.defineProperty(this, "leftWing", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "rightWing", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "material", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.material = new MeshStandardMaterial({
      side: DoubleSide,
      transparent: true,
      alphaTest: 1e-5
    });
    const leftWingBox = new BoxGeometry(12, 22, 4);
    setCapeUVs(leftWingBox, 22, 0, 10, 20, 2);
    const leftWingMesh = new Mesh(leftWingBox, this.material);
    leftWingMesh.position.x = -5;
    leftWingMesh.position.y = -10;
    leftWingMesh.position.z = -1;
    this.leftWing = new Group();
    this.leftWing.add(leftWingMesh);
    this.add(this.leftWing);
    const rightWingBox = new BoxGeometry(12, 22, 4);
    setCapeUVs(rightWingBox, 22, 0, 10, 20, 2);
    const rightWingMesh = new Mesh(rightWingBox, this.material);
    rightWingMesh.scale.x = -1;
    rightWingMesh.position.x = 5;
    rightWingMesh.position.y = -10;
    rightWingMesh.position.z = -1;
    this.rightWing = new Group();
    this.rightWing.add(rightWingMesh);
    this.add(this.rightWing);
    this.leftWing.position.x = 5;
    this.leftWing.rotation.x = 0.2617994;
    this.resetJoints();
  }
  resetJoints() {
    this.leftWing.rotation.y = 0.01;
    this.leftWing.rotation.z = 0.2617994;
    this.updateRightWing();
  }
  /**
   * Mirrors the position & rotation of left wing,
   * and apply them to the right wing.
   */
  updateRightWing() {
    this.rightWing.position.x = -this.leftWing.position.x;
    this.rightWing.position.y = this.leftWing.position.y;
    this.rightWing.rotation.x = this.leftWing.rotation.x;
    this.rightWing.rotation.y = -this.leftWing.rotation.y;
    this.rightWing.rotation.z = -this.leftWing.rotation.z;
  }
  get map() {
    return this.material.map;
  }
  set map(newMap) {
    this.material.map = newMap;
    this.material.needsUpdate = true;
  }
}
class EarsObject extends Group {
  constructor() {
    super();
    Object.defineProperty(this, "rightEar", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "leftEar", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "material", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.material = new MeshStandardMaterial({
      side: FrontSide
    });
    const earBox = new BoxGeometry(8, 8, 4 / 3);
    setUVs(earBox, 0, 0, 6, 6, 1, 14, 7);
    this.rightEar = new Mesh(earBox, this.material);
    this.rightEar.name = "rightEar";
    this.rightEar.position.x = -6;
    this.add(this.rightEar);
    this.leftEar = new Mesh(earBox, this.material);
    this.leftEar.name = "leftEar";
    this.leftEar.position.x = 6;
    this.add(this.leftEar);
  }
  get map() {
    return this.material.map;
  }
  set map(newMap) {
    this.material.map = newMap;
    this.material.needsUpdate = true;
  }
}
const CapeDefaultAngle = 10.8 * Math.PI / 180;
class PlayerObject extends Group {
  constructor() {
    super();
    Object.defineProperty(this, "skin", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "cape", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "elytra", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "ears", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.skin = new SkinObject();
    this.skin.name = "skin";
    this.skin.position.y = 8;
    this.add(this.skin);
    this.cape = new CapeObject();
    this.cape.name = "cape";
    this.cape.position.y = 8;
    this.cape.position.z = -2;
    this.cape.rotation.x = CapeDefaultAngle;
    this.cape.rotation.y = Math.PI;
    this.add(this.cape);
    this.elytra = new ElytraObject();
    this.elytra.name = "elytra";
    this.elytra.position.y = 8;
    this.elytra.position.z = -2;
    this.elytra.visible = false;
    this.add(this.elytra);
    this.ears = new EarsObject();
    this.ears.name = "ears";
    this.ears.position.y = 10;
    this.ears.position.z = 2 / 3;
    this.ears.visible = false;
    this.skin.head.add(this.ears);
  }
  get backEquipment() {
    if (this.cape.visible) {
      return "cape";
    } else if (this.elytra.visible) {
      return "elytra";
    } else {
      return null;
    }
  }
  set backEquipment(value) {
    this.cape.visible = value === "cape";
    this.elytra.visible = value === "elytra";
  }
  resetJoints() {
    this.skin.resetJoints();
    this.cape.rotation.x = CapeDefaultAngle;
    this.cape.position.y = 8;
    this.cape.position.z = -2;
    this.elytra.position.y = 8;
    this.elytra.position.z = -2;
    this.elytra.rotation.x = 0;
    this.elytra.resetJoints();
  }
}
function isTextureSource(value) {
  return value instanceof HTMLImageElement || value instanceof HTMLVideoElement || value instanceof HTMLCanvasElement || typeof ImageBitmap !== "undefined" && value instanceof ImageBitmap || typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas;
}
function hasTransparency(context, x0, y0, w, h) {
  const imgData = context.getImageData(x0, y0, w, h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const offset = (x + y * w) * 4;
      if (imgData.data[offset + 3] !== 255) {
        return true;
      }
    }
  }
  return false;
}
function computeSkinScale(width) {
  return width / 64;
}
function fixOpaqueSkin(context, width, format1_8) {
  if (format1_8) {
    if (hasTransparency(context, 0, 0, width, width))
      return;
  } else {
    if (hasTransparency(context, 0, 0, width, width / 2))
      return;
  }
  const scale = computeSkinScale(width);
  const clearArea = (x, y, w, h) => context.clearRect(x * scale, y * scale, w * scale, h * scale);
  clearArea(40, 0, 8, 8);
  clearArea(48, 0, 8, 8);
  clearArea(32, 8, 8, 8);
  clearArea(40, 8, 8, 8);
  clearArea(48, 8, 8, 8);
  clearArea(56, 8, 8, 8);
  if (format1_8) {
    clearArea(4, 32, 4, 4);
    clearArea(8, 32, 4, 4);
    clearArea(0, 36, 4, 12);
    clearArea(4, 36, 4, 12);
    clearArea(8, 36, 4, 12);
    clearArea(12, 36, 4, 12);
    clearArea(20, 32, 8, 4);
    clearArea(28, 32, 8, 4);
    clearArea(16, 36, 4, 12);
    clearArea(20, 36, 8, 12);
    clearArea(28, 36, 4, 12);
    clearArea(32, 36, 8, 12);
    clearArea(44, 32, 4, 4);
    clearArea(48, 32, 4, 4);
    clearArea(40, 36, 4, 12);
    clearArea(44, 36, 4, 12);
    clearArea(48, 36, 4, 12);
    clearArea(52, 36, 12, 12);
    clearArea(4, 48, 4, 4);
    clearArea(8, 48, 4, 4);
    clearArea(0, 52, 4, 12);
    clearArea(4, 52, 4, 12);
    clearArea(8, 52, 4, 12);
    clearArea(12, 52, 4, 12);
    clearArea(52, 48, 4, 4);
    clearArea(56, 48, 4, 4);
    clearArea(48, 52, 4, 12);
    clearArea(52, 52, 4, 12);
    clearArea(56, 52, 4, 12);
    clearArea(60, 52, 4, 12);
  }
}
function convertSkinTo1_8(context, width) {
  context.save();
  context.scale(-1, 1);
  const scale = computeSkinScale(width);
  const copySkin = (sX, sY, w, h, dX, dY) => context.drawImage(context.canvas, sX * scale, sY * scale, w * scale, h * scale, -dX * scale, dY * scale, -w * scale, h * scale);
  copySkin(4, 16, 4, 4, 20, 48);
  copySkin(8, 16, 4, 4, 24, 48);
  copySkin(0, 20, 4, 12, 24, 52);
  copySkin(4, 20, 4, 12, 20, 52);
  copySkin(8, 20, 4, 12, 16, 52);
  copySkin(12, 20, 4, 12, 28, 52);
  copySkin(44, 16, 4, 4, 36, 48);
  copySkin(48, 16, 4, 4, 40, 48);
  copySkin(40, 20, 4, 12, 40, 52);
  copySkin(44, 20, 4, 12, 36, 52);
  copySkin(48, 20, 4, 12, 32, 52);
  copySkin(52, 20, 4, 12, 44, 52);
  context.restore();
}
function loadSkinToCanvas(canvas, image) {
  let isOldFormat = false;
  if (image.width !== image.height) {
    if (image.width === 2 * image.height) {
      isOldFormat = true;
    } else {
      throw new Error(`Bad skin size: ${image.width}x${image.height}`);
    }
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (isOldFormat) {
    const sideLength = image.width;
    canvas.width = sideLength;
    canvas.height = sideLength;
    context.clearRect(0, 0, sideLength, sideLength);
    context.drawImage(image, 0, 0, sideLength, sideLength / 2);
    convertSkinTo1_8(context, sideLength);
    fixOpaqueSkin(context, canvas.width, false);
  } else {
    canvas.width = image.width;
    canvas.height = image.height;
    context.clearRect(0, 0, image.width, image.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    fixOpaqueSkin(context, canvas.width, true);
  }
}
function computeCapeScale(image) {
  if (image.width === 2 * image.height) {
    return image.width / 64;
  } else if (image.width * 17 === image.height * 22) {
    return image.width / 22;
  } else if (image.width * 11 === image.height * 23) {
    return image.width / 46;
  } else {
    throw new Error(`Bad cape size: ${image.width}x${image.height}`);
  }
}
function loadCapeToCanvas(canvas, image) {
  const scale = computeCapeScale(image);
  canvas.width = 64 * scale;
  canvas.height = 32 * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, image.width, image.height);
}
function isAreaBlack(context, x0, y0, w, h) {
  const imgData = context.getImageData(x0, y0, w, h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const offset = (x + y * w) * 4;
      if (!(imgData.data[offset + 0] === 0 && imgData.data[offset + 1] === 0 && imgData.data[offset + 2] === 0 && imgData.data[offset + 3] === 255)) {
        return false;
      }
    }
  }
  return true;
}
function isAreaWhite(context, x0, y0, w, h) {
  const imgData = context.getImageData(x0, y0, w, h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const offset = (x + y * w) * 4;
      if (!(imgData.data[offset + 0] === 255 && imgData.data[offset + 1] === 255 && imgData.data[offset + 2] === 255 && imgData.data[offset + 3] === 255)) {
        return false;
      }
    }
  }
  return true;
}
function inferModelType(canvas) {
  const scale = computeSkinScale(canvas.width);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const checkTransparency = (x, y, w, h) => hasTransparency(context, x * scale, y * scale, w * scale, h * scale);
  const checkBlack = (x, y, w, h) => isAreaBlack(context, x * scale, y * scale, w * scale, h * scale);
  const checkWhite = (x, y, w, h) => isAreaWhite(context, x * scale, y * scale, w * scale, h * scale);
  const isSlim = checkTransparency(50, 16, 2, 4) || checkTransparency(54, 20, 2, 12) || checkTransparency(42, 48, 2, 4) || checkTransparency(46, 52, 2, 12) || checkBlack(50, 16, 2, 4) && checkBlack(54, 20, 2, 12) && checkBlack(42, 48, 2, 4) && checkBlack(46, 52, 2, 12) || checkWhite(50, 16, 2, 4) && checkWhite(54, 20, 2, 12) && checkWhite(42, 48, 2, 4) && checkWhite(46, 52, 2, 12);
  return isSlim ? "slim" : "default";
}
function computeEarsScale(image) {
  if (image.width === image.height * 2 && image.height % 7 === 0) {
    return image.height / 7;
  } else {
    throw new Error(`Bad ears size: ${image.width}x${image.height}`);
  }
}
function loadEarsToCanvas(canvas, image) {
  const scale = computeEarsScale(image);
  canvas.width = 14 * scale;
  canvas.height = 7 * scale;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, image.width, image.height);
}
function loadEarsToCanvasFromSkin(canvas, image) {
  if (image.width !== image.height && image.width !== 2 * image.height) {
    throw new Error(`Bad skin size: ${image.width}x${image.height}`);
  }
  const scale = computeSkinScale(image.width);
  const w = 14 * scale;
  const h = 7 * scale;
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, w, h);
  context.drawImage(image, 24 * scale, 0, w, h, 0, 0, w, h);
}
async function loadImage(source) {
  const image = document.createElement("img");
  return new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.crossOrigin = "anonymous";
    if (typeof source === "string") {
      image.src = source;
    } else {
      if (source.crossOrigin !== void 0) {
        image.crossOrigin = source.crossOrigin;
      }
      if (source.referrerPolicy !== void 0) {
        image.referrerPolicy = source.referrerPolicy;
      }
      image.src = source.src;
    }
  });
}
const _changeEvent = { type: "change" };
const _startEvent = { type: "start" };
const _endEvent = { type: "end" };
const _ray = new Ray();
const _plane = new Plane();
const TILT_LIMIT = Math.cos(70 * MathUtils.DEG2RAD);
class OrbitControls extends EventDispatcher {
  constructor(object, domElement) {
    super();
    this.object = object;
    this.domElement = domElement;
    this.domElement.style.touchAction = "none";
    this.enabled = true;
    this.target = new Vector3();
    this.minDistance = 0;
    this.maxDistance = Infinity;
    this.minZoom = 0;
    this.maxZoom = Infinity;
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;
    this.minAzimuthAngle = -Infinity;
    this.maxAzimuthAngle = Infinity;
    this.enableDamping = false;
    this.dampingFactor = 0.05;
    this.enableZoom = true;
    this.zoomSpeed = 1;
    this.enableRotate = true;
    this.rotateSpeed = 1;
    this.enablePan = true;
    this.panSpeed = 1;
    this.screenSpacePanning = true;
    this.keyPanSpeed = 7;
    this.zoomToCursor = false;
    this.autoRotate = false;
    this.autoRotateSpeed = 2;
    this.keys = { LEFT: "ArrowLeft", UP: "ArrowUp", RIGHT: "ArrowRight", BOTTOM: "ArrowDown" };
    this.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
    this.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.zoom0 = this.object.zoom;
    this._domElementKeyEvents = null;
    this.getPolarAngle = function() {
      return spherical.phi;
    };
    this.getAzimuthalAngle = function() {
      return spherical.theta;
    };
    this.getDistance = function() {
      return this.object.position.distanceTo(this.target);
    };
    this.listenToKeyEvents = function(domElement2) {
      domElement2.addEventListener("keydown", onKeyDown);
      this._domElementKeyEvents = domElement2;
    };
    this.stopListenToKeyEvents = function() {
      this._domElementKeyEvents.removeEventListener("keydown", onKeyDown);
      this._domElementKeyEvents = null;
    };
    this.saveState = function() {
      scope.target0.copy(scope.target);
      scope.position0.copy(scope.object.position);
      scope.zoom0 = scope.object.zoom;
    };
    this.reset = function() {
      scope.target.copy(scope.target0);
      scope.object.position.copy(scope.position0);
      scope.object.zoom = scope.zoom0;
      scope.object.updateProjectionMatrix();
      scope.dispatchEvent(_changeEvent);
      scope.update();
      state = STATE.NONE;
    };
    this.update = (function() {
      const offset = new Vector3();
      const quat = new Quaternion().setFromUnitVectors(object.up, new Vector3(0, 1, 0));
      const quatInverse = quat.clone().invert();
      const lastPosition = new Vector3();
      const lastQuaternion = new Quaternion();
      const lastTargetPosition = new Vector3();
      const twoPI = 2 * Math.PI;
      return function update(deltaTime = null) {
        const position = scope.object.position;
        offset.copy(position).sub(scope.target);
        offset.applyQuaternion(quat);
        spherical.setFromVector3(offset);
        if (scope.autoRotate && state === STATE.NONE) {
          rotateLeft(getAutoRotationAngle(deltaTime));
        }
        if (scope.enableDamping) {
          spherical.theta += sphericalDelta.theta * scope.dampingFactor;
          spherical.phi += sphericalDelta.phi * scope.dampingFactor;
        } else {
          spherical.theta += sphericalDelta.theta;
          spherical.phi += sphericalDelta.phi;
        }
        let min = scope.minAzimuthAngle;
        let max = scope.maxAzimuthAngle;
        if (isFinite(min) && isFinite(max)) {
          if (min < -Math.PI) min += twoPI;
          else if (min > Math.PI) min -= twoPI;
          if (max < -Math.PI) max += twoPI;
          else if (max > Math.PI) max -= twoPI;
          if (min <= max) {
            spherical.theta = Math.max(min, Math.min(max, spherical.theta));
          } else {
            spherical.theta = spherical.theta > (min + max) / 2 ? Math.max(min, spherical.theta) : Math.min(max, spherical.theta);
          }
        }
        spherical.phi = Math.max(scope.minPolarAngle, Math.min(scope.maxPolarAngle, spherical.phi));
        spherical.makeSafe();
        if (scope.enableDamping === true) {
          scope.target.addScaledVector(panOffset, scope.dampingFactor);
        } else {
          scope.target.add(panOffset);
        }
        if (scope.zoomToCursor && performCursorZoom || scope.object.isOrthographicCamera) {
          spherical.radius = clampDistance(spherical.radius);
        } else {
          spherical.radius = clampDistance(spherical.radius * scale);
        }
        offset.setFromSpherical(spherical);
        offset.applyQuaternion(quatInverse);
        position.copy(scope.target).add(offset);
        scope.object.lookAt(scope.target);
        if (scope.enableDamping === true) {
          sphericalDelta.theta *= 1 - scope.dampingFactor;
          sphericalDelta.phi *= 1 - scope.dampingFactor;
          panOffset.multiplyScalar(1 - scope.dampingFactor);
        } else {
          sphericalDelta.set(0, 0, 0);
          panOffset.set(0, 0, 0);
        }
        let zoomChanged = false;
        if (scope.zoomToCursor && performCursorZoom) {
          let newRadius = null;
          if (scope.object.isPerspectiveCamera) {
            const prevRadius = offset.length();
            newRadius = clampDistance(prevRadius * scale);
            const radiusDelta = prevRadius - newRadius;
            scope.object.position.addScaledVector(dollyDirection, radiusDelta);
            scope.object.updateMatrixWorld();
          } else if (scope.object.isOrthographicCamera) {
            const mouseBefore = new Vector3(mouse.x, mouse.y, 0);
            mouseBefore.unproject(scope.object);
            scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom / scale));
            scope.object.updateProjectionMatrix();
            zoomChanged = true;
            const mouseAfter = new Vector3(mouse.x, mouse.y, 0);
            mouseAfter.unproject(scope.object);
            scope.object.position.sub(mouseAfter).add(mouseBefore);
            scope.object.updateMatrixWorld();
            newRadius = offset.length();
          } else {
            console.warn("WARNING: OrbitControls.js encountered an unknown camera type - zoom to cursor disabled.");
            scope.zoomToCursor = false;
          }
          if (newRadius !== null) {
            if (this.screenSpacePanning) {
              scope.target.set(0, 0, -1).transformDirection(scope.object.matrix).multiplyScalar(newRadius).add(scope.object.position);
            } else {
              _ray.origin.copy(scope.object.position);
              _ray.direction.set(0, 0, -1).transformDirection(scope.object.matrix);
              if (Math.abs(scope.object.up.dot(_ray.direction)) < TILT_LIMIT) {
                object.lookAt(scope.target);
              } else {
                _plane.setFromNormalAndCoplanarPoint(scope.object.up, scope.target);
                _ray.intersectPlane(_plane, scope.target);
              }
            }
          }
        } else if (scope.object.isOrthographicCamera) {
          scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom / scale));
          scope.object.updateProjectionMatrix();
          zoomChanged = true;
        }
        scale = 1;
        performCursorZoom = false;
        if (zoomChanged || lastPosition.distanceToSquared(scope.object.position) > EPS || 8 * (1 - lastQuaternion.dot(scope.object.quaternion)) > EPS || lastTargetPosition.distanceToSquared(scope.target) > 0) {
          scope.dispatchEvent(_changeEvent);
          lastPosition.copy(scope.object.position);
          lastQuaternion.copy(scope.object.quaternion);
          lastTargetPosition.copy(scope.target);
          zoomChanged = false;
          return true;
        }
        return false;
      };
    })();
    this.dispose = function() {
      scope.domElement.removeEventListener("contextmenu", onContextMenu);
      scope.domElement.removeEventListener("pointerdown", onPointerDown);
      scope.domElement.removeEventListener("pointercancel", onPointerUp);
      scope.domElement.removeEventListener("wheel", onMouseWheel);
      scope.domElement.removeEventListener("pointermove", onPointerMove);
      scope.domElement.removeEventListener("pointerup", onPointerUp);
      if (scope._domElementKeyEvents !== null) {
        scope._domElementKeyEvents.removeEventListener("keydown", onKeyDown);
        scope._domElementKeyEvents = null;
      }
    };
    const scope = this;
    const STATE = {
      NONE: -1,
      ROTATE: 0,
      DOLLY: 1,
      PAN: 2,
      TOUCH_ROTATE: 3,
      TOUCH_PAN: 4,
      TOUCH_DOLLY_PAN: 5,
      TOUCH_DOLLY_ROTATE: 6
    };
    let state = STATE.NONE;
    const EPS = 1e-6;
    const spherical = new Spherical();
    const sphericalDelta = new Spherical();
    let scale = 1;
    const panOffset = new Vector3();
    const rotateStart = new Vector2();
    const rotateEnd = new Vector2();
    const rotateDelta = new Vector2();
    const panStart = new Vector2();
    const panEnd = new Vector2();
    const panDelta = new Vector2();
    const dollyStart = new Vector2();
    const dollyEnd = new Vector2();
    const dollyDelta = new Vector2();
    const dollyDirection = new Vector3();
    const mouse = new Vector2();
    let performCursorZoom = false;
    const pointers = [];
    const pointerPositions = {};
    function getAutoRotationAngle(deltaTime) {
      if (deltaTime !== null) {
        return 2 * Math.PI / 60 * scope.autoRotateSpeed * deltaTime;
      } else {
        return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;
      }
    }
    function getZoomScale() {
      return Math.pow(0.95, scope.zoomSpeed);
    }
    function rotateLeft(angle) {
      sphericalDelta.theta -= angle;
    }
    function rotateUp(angle) {
      sphericalDelta.phi -= angle;
    }
    const panLeft = (function() {
      const v = new Vector3();
      return function panLeft2(distance, objectMatrix) {
        v.setFromMatrixColumn(objectMatrix, 0);
        v.multiplyScalar(-distance);
        panOffset.add(v);
      };
    })();
    const panUp = (function() {
      const v = new Vector3();
      return function panUp2(distance, objectMatrix) {
        if (scope.screenSpacePanning === true) {
          v.setFromMatrixColumn(objectMatrix, 1);
        } else {
          v.setFromMatrixColumn(objectMatrix, 0);
          v.crossVectors(scope.object.up, v);
        }
        v.multiplyScalar(distance);
        panOffset.add(v);
      };
    })();
    const pan = (function() {
      const offset = new Vector3();
      return function pan2(deltaX, deltaY) {
        const element = scope.domElement;
        if (scope.object.isPerspectiveCamera) {
          const position = scope.object.position;
          offset.copy(position).sub(scope.target);
          let targetDistance = offset.length();
          targetDistance *= Math.tan(scope.object.fov / 2 * Math.PI / 180);
          panLeft(2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix);
          panUp(2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix);
        } else if (scope.object.isOrthographicCamera) {
          panLeft(deltaX * (scope.object.right - scope.object.left) / scope.object.zoom / element.clientWidth, scope.object.matrix);
          panUp(deltaY * (scope.object.top - scope.object.bottom) / scope.object.zoom / element.clientHeight, scope.object.matrix);
        } else {
          console.warn("WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.");
          scope.enablePan = false;
        }
      };
    })();
    function dollyOut(dollyScale) {
      if (scope.object.isPerspectiveCamera || scope.object.isOrthographicCamera) {
        scale /= dollyScale;
      } else {
        console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.");
        scope.enableZoom = false;
      }
    }
    function dollyIn(dollyScale) {
      if (scope.object.isPerspectiveCamera || scope.object.isOrthographicCamera) {
        scale *= dollyScale;
      } else {
        console.warn("WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.");
        scope.enableZoom = false;
      }
    }
    function updateMouseParameters(event) {
      if (!scope.zoomToCursor) {
        return;
      }
      performCursorZoom = true;
      const rect = scope.domElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      mouse.x = x / w * 2 - 1;
      mouse.y = -(y / h) * 2 + 1;
      dollyDirection.set(mouse.x, mouse.y, 1).unproject(scope.object).sub(scope.object.position).normalize();
    }
    function clampDistance(dist) {
      return Math.max(scope.minDistance, Math.min(scope.maxDistance, dist));
    }
    function handleMouseDownRotate(event) {
      rotateStart.set(event.clientX, event.clientY);
    }
    function handleMouseDownDolly(event) {
      updateMouseParameters(event);
      dollyStart.set(event.clientX, event.clientY);
    }
    function handleMouseDownPan(event) {
      panStart.set(event.clientX, event.clientY);
    }
    function handleMouseMoveRotate(event) {
      rotateEnd.set(event.clientX, event.clientY);
      rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(scope.rotateSpeed);
      const element = scope.domElement;
      rotateLeft(2 * Math.PI * rotateDelta.x / element.clientHeight);
      rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight);
      rotateStart.copy(rotateEnd);
      scope.update();
    }
    function handleMouseMoveDolly(event) {
      dollyEnd.set(event.clientX, event.clientY);
      dollyDelta.subVectors(dollyEnd, dollyStart);
      if (dollyDelta.y > 0) {
        dollyOut(getZoomScale());
      } else if (dollyDelta.y < 0) {
        dollyIn(getZoomScale());
      }
      dollyStart.copy(dollyEnd);
      scope.update();
    }
    function handleMouseMovePan(event) {
      panEnd.set(event.clientX, event.clientY);
      panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);
      pan(panDelta.x, panDelta.y);
      panStart.copy(panEnd);
      scope.update();
    }
    function handleMouseWheel(event) {
      updateMouseParameters(event);
      if (event.deltaY < 0) {
        dollyIn(getZoomScale());
      } else if (event.deltaY > 0) {
        dollyOut(getZoomScale());
      }
      scope.update();
    }
    function handleKeyDown(event) {
      let needsUpdate = false;
      switch (event.code) {
        case scope.keys.UP:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            rotateUp(2 * Math.PI * scope.rotateSpeed / scope.domElement.clientHeight);
          } else {
            pan(0, scope.keyPanSpeed);
          }
          needsUpdate = true;
          break;
        case scope.keys.BOTTOM:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            rotateUp(-2 * Math.PI * scope.rotateSpeed / scope.domElement.clientHeight);
          } else {
            pan(0, -scope.keyPanSpeed);
          }
          needsUpdate = true;
          break;
        case scope.keys.LEFT:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            rotateLeft(2 * Math.PI * scope.rotateSpeed / scope.domElement.clientHeight);
          } else {
            pan(scope.keyPanSpeed, 0);
          }
          needsUpdate = true;
          break;
        case scope.keys.RIGHT:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            rotateLeft(-2 * Math.PI * scope.rotateSpeed / scope.domElement.clientHeight);
          } else {
            pan(-scope.keyPanSpeed, 0);
          }
          needsUpdate = true;
          break;
      }
      if (needsUpdate) {
        event.preventDefault();
        scope.update();
      }
    }
    function handleTouchStartRotate() {
      if (pointers.length === 1) {
        rotateStart.set(pointers[0].pageX, pointers[0].pageY);
      } else {
        const x = 0.5 * (pointers[0].pageX + pointers[1].pageX);
        const y = 0.5 * (pointers[0].pageY + pointers[1].pageY);
        rotateStart.set(x, y);
      }
    }
    function handleTouchStartPan() {
      if (pointers.length === 1) {
        panStart.set(pointers[0].pageX, pointers[0].pageY);
      } else {
        const x = 0.5 * (pointers[0].pageX + pointers[1].pageX);
        const y = 0.5 * (pointers[0].pageY + pointers[1].pageY);
        panStart.set(x, y);
      }
    }
    function handleTouchStartDolly() {
      const dx = pointers[0].pageX - pointers[1].pageX;
      const dy = pointers[0].pageY - pointers[1].pageY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      dollyStart.set(0, distance);
    }
    function handleTouchStartDollyPan() {
      if (scope.enableZoom) handleTouchStartDolly();
      if (scope.enablePan) handleTouchStartPan();
    }
    function handleTouchStartDollyRotate() {
      if (scope.enableZoom) handleTouchStartDolly();
      if (scope.enableRotate) handleTouchStartRotate();
    }
    function handleTouchMoveRotate(event) {
      if (pointers.length == 1) {
        rotateEnd.set(event.pageX, event.pageY);
      } else {
        const position = getSecondPointerPosition(event);
        const x = 0.5 * (event.pageX + position.x);
        const y = 0.5 * (event.pageY + position.y);
        rotateEnd.set(x, y);
      }
      rotateDelta.subVectors(rotateEnd, rotateStart).multiplyScalar(scope.rotateSpeed);
      const element = scope.domElement;
      rotateLeft(2 * Math.PI * rotateDelta.x / element.clientHeight);
      rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight);
      rotateStart.copy(rotateEnd);
    }
    function handleTouchMovePan(event) {
      if (pointers.length === 1) {
        panEnd.set(event.pageX, event.pageY);
      } else {
        const position = getSecondPointerPosition(event);
        const x = 0.5 * (event.pageX + position.x);
        const y = 0.5 * (event.pageY + position.y);
        panEnd.set(x, y);
      }
      panDelta.subVectors(panEnd, panStart).multiplyScalar(scope.panSpeed);
      pan(panDelta.x, panDelta.y);
      panStart.copy(panEnd);
    }
    function handleTouchMoveDolly(event) {
      const position = getSecondPointerPosition(event);
      const dx = event.pageX - position.x;
      const dy = event.pageY - position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      dollyEnd.set(0, distance);
      dollyDelta.set(0, Math.pow(dollyEnd.y / dollyStart.y, scope.zoomSpeed));
      dollyOut(dollyDelta.y);
      dollyStart.copy(dollyEnd);
    }
    function handleTouchMoveDollyPan(event) {
      if (scope.enableZoom) handleTouchMoveDolly(event);
      if (scope.enablePan) handleTouchMovePan(event);
    }
    function handleTouchMoveDollyRotate(event) {
      if (scope.enableZoom) handleTouchMoveDolly(event);
      if (scope.enableRotate) handleTouchMoveRotate(event);
    }
    function onPointerDown(event) {
      if (scope.enabled === false) return;
      if (pointers.length === 0) {
        scope.domElement.setPointerCapture(event.pointerId);
        scope.domElement.addEventListener("pointermove", onPointerMove);
        scope.domElement.addEventListener("pointerup", onPointerUp);
      }
      addPointer(event);
      if (event.pointerType === "touch") {
        onTouchStart(event);
      } else {
        onMouseDown(event);
      }
    }
    function onPointerMove(event) {
      if (scope.enabled === false) return;
      if (event.pointerType === "touch") {
        onTouchMove(event);
      } else {
        onMouseMove(event);
      }
    }
    function onPointerUp(event) {
      removePointer(event);
      if (pointers.length === 0) {
        scope.domElement.releasePointerCapture(event.pointerId);
        scope.domElement.removeEventListener("pointermove", onPointerMove);
        scope.domElement.removeEventListener("pointerup", onPointerUp);
      }
      scope.dispatchEvent(_endEvent);
      state = STATE.NONE;
    }
    function onMouseDown(event) {
      let mouseAction;
      switch (event.button) {
        case 0:
          mouseAction = scope.mouseButtons.LEFT;
          break;
        case 1:
          mouseAction = scope.mouseButtons.MIDDLE;
          break;
        case 2:
          mouseAction = scope.mouseButtons.RIGHT;
          break;
        default:
          mouseAction = -1;
      }
      switch (mouseAction) {
        case MOUSE.DOLLY:
          if (scope.enableZoom === false) return;
          handleMouseDownDolly(event);
          state = STATE.DOLLY;
          break;
        case MOUSE.ROTATE:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            if (scope.enablePan === false) return;
            handleMouseDownPan(event);
            state = STATE.PAN;
          } else {
            if (scope.enableRotate === false) return;
            handleMouseDownRotate(event);
            state = STATE.ROTATE;
          }
          break;
        case MOUSE.PAN:
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            if (scope.enableRotate === false) return;
            handleMouseDownRotate(event);
            state = STATE.ROTATE;
          } else {
            if (scope.enablePan === false) return;
            handleMouseDownPan(event);
            state = STATE.PAN;
          }
          break;
        default:
          state = STATE.NONE;
      }
      if (state !== STATE.NONE) {
        scope.dispatchEvent(_startEvent);
      }
    }
    function onMouseMove(event) {
      switch (state) {
        case STATE.ROTATE:
          if (scope.enableRotate === false) return;
          handleMouseMoveRotate(event);
          break;
        case STATE.DOLLY:
          if (scope.enableZoom === false) return;
          handleMouseMoveDolly(event);
          break;
        case STATE.PAN:
          if (scope.enablePan === false) return;
          handleMouseMovePan(event);
          break;
      }
    }
    function onMouseWheel(event) {
      if (scope.enabled === false || scope.enableZoom === false || state !== STATE.NONE) return;
      event.preventDefault();
      scope.dispatchEvent(_startEvent);
      handleMouseWheel(event);
      scope.dispatchEvent(_endEvent);
    }
    function onKeyDown(event) {
      if (scope.enabled === false || scope.enablePan === false) return;
      handleKeyDown(event);
    }
    function onTouchStart(event) {
      trackPointer(event);
      switch (pointers.length) {
        case 1:
          switch (scope.touches.ONE) {
            case TOUCH.ROTATE:
              if (scope.enableRotate === false) return;
              handleTouchStartRotate();
              state = STATE.TOUCH_ROTATE;
              break;
            case TOUCH.PAN:
              if (scope.enablePan === false) return;
              handleTouchStartPan();
              state = STATE.TOUCH_PAN;
              break;
            default:
              state = STATE.NONE;
          }
          break;
        case 2:
          switch (scope.touches.TWO) {
            case TOUCH.DOLLY_PAN:
              if (scope.enableZoom === false && scope.enablePan === false) return;
              handleTouchStartDollyPan();
              state = STATE.TOUCH_DOLLY_PAN;
              break;
            case TOUCH.DOLLY_ROTATE:
              if (scope.enableZoom === false && scope.enableRotate === false) return;
              handleTouchStartDollyRotate();
              state = STATE.TOUCH_DOLLY_ROTATE;
              break;
            default:
              state = STATE.NONE;
          }
          break;
        default:
          state = STATE.NONE;
      }
      if (state !== STATE.NONE) {
        scope.dispatchEvent(_startEvent);
      }
    }
    function onTouchMove(event) {
      trackPointer(event);
      switch (state) {
        case STATE.TOUCH_ROTATE:
          if (scope.enableRotate === false) return;
          handleTouchMoveRotate(event);
          scope.update();
          break;
        case STATE.TOUCH_PAN:
          if (scope.enablePan === false) return;
          handleTouchMovePan(event);
          scope.update();
          break;
        case STATE.TOUCH_DOLLY_PAN:
          if (scope.enableZoom === false && scope.enablePan === false) return;
          handleTouchMoveDollyPan(event);
          scope.update();
          break;
        case STATE.TOUCH_DOLLY_ROTATE:
          if (scope.enableZoom === false && scope.enableRotate === false) return;
          handleTouchMoveDollyRotate(event);
          scope.update();
          break;
        default:
          state = STATE.NONE;
      }
    }
    function onContextMenu(event) {
      if (scope.enabled === false) return;
      event.preventDefault();
    }
    function addPointer(event) {
      pointers.push(event);
    }
    function removePointer(event) {
      delete pointerPositions[event.pointerId];
      for (let i = 0; i < pointers.length; i++) {
        if (pointers[i].pointerId == event.pointerId) {
          pointers.splice(i, 1);
          return;
        }
      }
    }
    function trackPointer(event) {
      let position = pointerPositions[event.pointerId];
      if (position === void 0) {
        position = new Vector2();
        pointerPositions[event.pointerId] = position;
      }
      position.set(event.pageX, event.pageY);
    }
    function getSecondPointerPosition(event) {
      const pointer = event.pointerId === pointers[0].pointerId ? pointers[1] : pointers[0];
      return pointerPositions[pointer.pointerId];
    }
    scope.domElement.addEventListener("contextmenu", onContextMenu);
    scope.domElement.addEventListener("pointerdown", onPointerDown);
    scope.domElement.addEventListener("pointercancel", onPointerUp);
    scope.domElement.addEventListener("wheel", onMouseWheel, { passive: false });
    this.update();
  }
}
const CopyShader = {
  name: "CopyShader",
  uniforms: {
    "tDiffuse": { value: null },
    "opacity": { value: 1 }
  },
  vertexShader: (
    /* glsl */
    `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`
  ),
  fragmentShader: (
    /* glsl */
    `

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`
  )
};
class Pass {
  constructor() {
    this.isPass = true;
    this.enabled = true;
    this.needsSwap = true;
    this.clear = false;
    this.renderToScreen = false;
  }
  setSize() {
  }
  render() {
    console.error("THREE.Pass: .render() must be implemented in derived pass.");
  }
  dispose() {
  }
}
const _camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const _geometry = new BufferGeometry();
_geometry.setAttribute("position", new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
_geometry.setAttribute("uv", new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
class FullScreenQuad {
  constructor(material) {
    this._mesh = new Mesh(_geometry, material);
  }
  dispose() {
    this._mesh.geometry.dispose();
  }
  render(renderer) {
    renderer.render(this._mesh, _camera);
  }
  get material() {
    return this._mesh.material;
  }
  set material(value) {
    this._mesh.material = value;
  }
}
class ShaderPass extends Pass {
  constructor(shader, textureID) {
    super();
    this.textureID = textureID !== void 0 ? textureID : "tDiffuse";
    if (shader instanceof ShaderMaterial) {
      this.uniforms = shader.uniforms;
      this.material = shader;
    } else if (shader) {
      this.uniforms = UniformsUtils.clone(shader.uniforms);
      this.material = new ShaderMaterial({
        name: shader.name !== void 0 ? shader.name : "unspecified",
        defines: Object.assign({}, shader.defines),
        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader
      });
    }
    this.fsQuad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    if (this.uniforms[this.textureID]) {
      this.uniforms[this.textureID].value = readBuffer.texture;
    }
    this.fsQuad.material = this.material;
    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      this.fsQuad.render(renderer);
    }
  }
  dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}
class MaskPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.clear = true;
    this.needsSwap = false;
    this.inverse = false;
  }
  render(renderer, writeBuffer, readBuffer) {
    const context = renderer.getContext();
    const state = renderer.state;
    state.buffers.color.setMask(false);
    state.buffers.depth.setMask(false);
    state.buffers.color.setLocked(true);
    state.buffers.depth.setLocked(true);
    let writeValue, clearValue;
    if (this.inverse) {
      writeValue = 0;
      clearValue = 1;
    } else {
      writeValue = 1;
      clearValue = 0;
    }
    state.buffers.stencil.setTest(true);
    state.buffers.stencil.setOp(context.REPLACE, context.REPLACE, context.REPLACE);
    state.buffers.stencil.setFunc(context.ALWAYS, writeValue, 4294967295);
    state.buffers.stencil.setClear(clearValue);
    state.buffers.stencil.setLocked(true);
    renderer.setRenderTarget(readBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(writeBuffer);
    if (this.clear) renderer.clear();
    renderer.render(this.scene, this.camera);
    state.buffers.color.setLocked(false);
    state.buffers.depth.setLocked(false);
    state.buffers.color.setMask(true);
    state.buffers.depth.setMask(true);
    state.buffers.stencil.setLocked(false);
    state.buffers.stencil.setFunc(context.EQUAL, 1, 4294967295);
    state.buffers.stencil.setOp(context.KEEP, context.KEEP, context.KEEP);
    state.buffers.stencil.setLocked(true);
  }
}
class ClearMaskPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
  }
  render(renderer) {
    renderer.state.buffers.stencil.setLocked(false);
    renderer.state.buffers.stencil.setTest(false);
  }
}
class EffectComposer {
  constructor(renderer, renderTarget) {
    this.renderer = renderer;
    this._pixelRatio = renderer.getPixelRatio();
    if (renderTarget === void 0) {
      const size = renderer.getSize(new Vector2());
      this._width = size.width;
      this._height = size.height;
      renderTarget = new WebGLRenderTarget(this._width * this._pixelRatio, this._height * this._pixelRatio, { type: HalfFloatType });
      renderTarget.texture.name = "EffectComposer.rt1";
    } else {
      this._width = renderTarget.width;
      this._height = renderTarget.height;
    }
    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();
    this.renderTarget2.texture.name = "EffectComposer.rt2";
    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;
    this.renderToScreen = true;
    this.passes = [];
    this.copyPass = new ShaderPass(CopyShader);
    this.copyPass.material.blending = NoBlending;
    this.clock = new Clock();
  }
  swapBuffers() {
    const tmp = this.readBuffer;
    this.readBuffer = this.writeBuffer;
    this.writeBuffer = tmp;
  }
  addPass(pass) {
    this.passes.push(pass);
    pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
  }
  insertPass(pass, index) {
    this.passes.splice(index, 0, pass);
    pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
  }
  removePass(pass) {
    const index = this.passes.indexOf(pass);
    if (index !== -1) {
      this.passes.splice(index, 1);
    }
  }
  isLastEnabledPass(passIndex) {
    for (let i = passIndex + 1; i < this.passes.length; i++) {
      if (this.passes[i].enabled) {
        return false;
      }
    }
    return true;
  }
  render(deltaTime) {
    if (deltaTime === void 0) {
      deltaTime = this.clock.getDelta();
    }
    const currentRenderTarget = this.renderer.getRenderTarget();
    let maskActive = false;
    for (let i = 0, il = this.passes.length; i < il; i++) {
      const pass = this.passes[i];
      if (pass.enabled === false) continue;
      pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i);
      pass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime, maskActive);
      if (pass.needsSwap) {
        if (maskActive) {
          const context = this.renderer.getContext();
          const stencil = this.renderer.state.buffers.stencil;
          stencil.setFunc(context.NOTEQUAL, 1, 4294967295);
          this.copyPass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime);
          stencil.setFunc(context.EQUAL, 1, 4294967295);
        }
        this.swapBuffers();
      }
      if (MaskPass !== void 0) {
        if (pass instanceof MaskPass) {
          maskActive = true;
        } else if (pass instanceof ClearMaskPass) {
          maskActive = false;
        }
      }
    }
    this.renderer.setRenderTarget(currentRenderTarget);
  }
  reset(renderTarget) {
    if (renderTarget === void 0) {
      const size = this.renderer.getSize(new Vector2());
      this._pixelRatio = this.renderer.getPixelRatio();
      this._width = size.width;
      this._height = size.height;
      renderTarget = this.renderTarget1.clone();
      renderTarget.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio);
    }
    this.renderTarget1.dispose();
    this.renderTarget2.dispose();
    this.renderTarget1 = renderTarget;
    this.renderTarget2 = renderTarget.clone();
    this.writeBuffer = this.renderTarget1;
    this.readBuffer = this.renderTarget2;
  }
  setSize(width, height) {
    this._width = width;
    this._height = height;
    const effectiveWidth = this._width * this._pixelRatio;
    const effectiveHeight = this._height * this._pixelRatio;
    this.renderTarget1.setSize(effectiveWidth, effectiveHeight);
    this.renderTarget2.setSize(effectiveWidth, effectiveHeight);
    for (let i = 0; i < this.passes.length; i++) {
      this.passes[i].setSize(effectiveWidth, effectiveHeight);
    }
  }
  setPixelRatio(pixelRatio) {
    this._pixelRatio = pixelRatio;
    this.setSize(this._width, this._height);
  }
  dispose() {
    this.renderTarget1.dispose();
    this.renderTarget2.dispose();
    this.copyPass.dispose();
  }
}
class RenderPass extends Pass {
  constructor(scene, camera, overrideMaterial = null, clearColor = null, clearAlpha = null) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.overrideMaterial = overrideMaterial;
    this.clearColor = clearColor;
    this.clearAlpha = clearAlpha;
    this.clear = true;
    this.clearDepth = false;
    this.needsSwap = false;
    this._oldClearColor = new Color();
  }
  render(renderer, writeBuffer, readBuffer) {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    let oldClearAlpha, oldOverrideMaterial;
    if (this.overrideMaterial !== null) {
      oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.overrideMaterial;
    }
    if (this.clearColor !== null) {
      renderer.getClearColor(this._oldClearColor);
      renderer.setClearColor(this.clearColor);
    }
    if (this.clearAlpha !== null) {
      oldClearAlpha = renderer.getClearAlpha();
      renderer.setClearAlpha(this.clearAlpha);
    }
    if (this.clearDepth == true) {
      renderer.clearDepth();
    }
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    if (this.clear === true) {
      renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    }
    renderer.render(this.scene, this.camera);
    if (this.clearColor !== null) {
      renderer.setClearColor(this._oldClearColor);
    }
    if (this.clearAlpha !== null) {
      renderer.setClearAlpha(oldClearAlpha);
    }
    if (this.overrideMaterial !== null) {
      this.scene.overrideMaterial = oldOverrideMaterial;
    }
    renderer.autoClear = oldAutoClear;
  }
}
const FXAAShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "resolution": { value: new Vector2(1 / 1024, 1 / 512) }
  },
  vertexShader: (
    /* glsl */
    `

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`
  ),
  fragmentShader: `
	precision highp float;

	uniform sampler2D tDiffuse;

	uniform vec2 resolution;

	varying vec2 vUv;

	// FXAA 3.11 implementation by NVIDIA, ported to WebGL by Agost Biro (biro@archilogic.com)

	//----------------------------------------------------------------------------------
	// File:        es3-keplerFXAAassetsshaders/FXAA_DefaultES.frag
	// SDK Version: v3.00
	// Email:       gameworks@nvidia.com
	// Site:        http://developer.nvidia.com/
	//
	// Copyright (c) 2014-2015, NVIDIA CORPORATION. All rights reserved.
	//
	// Redistribution and use in source and binary forms, with or without
	// modification, are permitted provided that the following conditions
	// are met:
	//  * Redistributions of source code must retain the above copyright
	//    notice, this list of conditions and the following disclaimer.
	//  * Redistributions in binary form must reproduce the above copyright
	//    notice, this list of conditions and the following disclaimer in the
	//    documentation and/or other materials provided with the distribution.
	//  * Neither the name of NVIDIA CORPORATION nor the names of its
	//    contributors may be used to endorse or promote products derived
	//    from this software without specific prior written permission.
	//
	// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS ''AS IS'' AND ANY
	// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
	// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
	// PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR
	// CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
	// EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
	// PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
	// PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
	// OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
	// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
	// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
	//
	//----------------------------------------------------------------------------------

	#ifndef FXAA_DISCARD
			//
			// Only valid for PC OpenGL currently.
			// Probably will not work when FXAA_GREEN_AS_LUMA = 1.
			//
			// 1 = Use discard on pixels which don't need AA.
			//     For APIs which enable concurrent TEX+ROP from same surface.
			// 0 = Return unchanged color on pixels which don't need AA.
			//
			#define FXAA_DISCARD 0
	#endif

	/*--------------------------------------------------------------------------*/
	#define FxaaTexTop(t, p) texture2D(t, p, -100.0)
	#define FxaaTexOff(t, p, o, r) texture2D(t, p + (o * r), -100.0)
	/*--------------------------------------------------------------------------*/

	#define NUM_SAMPLES 5

	// assumes colors have premultipliedAlpha, so that the calculated color contrast is scaled by alpha
	float contrast( vec4 a, vec4 b ) {
			vec4 diff = abs( a - b );
			return max( max( max( diff.r, diff.g ), diff.b ), diff.a );
	}

	/*============================================================================

									FXAA3 QUALITY - PC

	============================================================================*/

	/*--------------------------------------------------------------------------*/
	vec4 FxaaPixelShader(
			vec2 posM,
			sampler2D tex,
			vec2 fxaaQualityRcpFrame,
			float fxaaQualityEdgeThreshold,
			float fxaaQualityinvEdgeThreshold
	) {
			vec4 rgbaM = FxaaTexTop(tex, posM);
			vec4 rgbaS = FxaaTexOff(tex, posM, vec2( 0.0, 1.0), fxaaQualityRcpFrame.xy);
			vec4 rgbaE = FxaaTexOff(tex, posM, vec2( 1.0, 0.0), fxaaQualityRcpFrame.xy);
			vec4 rgbaN = FxaaTexOff(tex, posM, vec2( 0.0,-1.0), fxaaQualityRcpFrame.xy);
			vec4 rgbaW = FxaaTexOff(tex, posM, vec2(-1.0, 0.0), fxaaQualityRcpFrame.xy);
			// . S .
			// W M E
			// . N .

			bool earlyExit = max( max( max(
					contrast( rgbaM, rgbaN ),
					contrast( rgbaM, rgbaS ) ),
					contrast( rgbaM, rgbaE ) ),
					contrast( rgbaM, rgbaW ) )
					< fxaaQualityEdgeThreshold;
			// . 0 .
			// 0 0 0
			// . 0 .

			#if (FXAA_DISCARD == 1)
					if(earlyExit) FxaaDiscard;
			#else
					if(earlyExit) return rgbaM;
			#endif

			float contrastN = contrast( rgbaM, rgbaN );
			float contrastS = contrast( rgbaM, rgbaS );
			float contrastE = contrast( rgbaM, rgbaE );
			float contrastW = contrast( rgbaM, rgbaW );

			float relativeVContrast = ( contrastN + contrastS ) - ( contrastE + contrastW );
			relativeVContrast *= fxaaQualityinvEdgeThreshold;

			bool horzSpan = relativeVContrast > 0.;
			// . 1 .
			// 0 0 0
			// . 1 .

			// 45 deg edge detection and corners of objects, aka V/H contrast is too similar
			if( abs( relativeVContrast ) < .3 ) {
					// locate the edge
					vec2 dirToEdge;
					dirToEdge.x = contrastE > contrastW ? 1. : -1.;
					dirToEdge.y = contrastS > contrastN ? 1. : -1.;
					// . 2 .      . 1 .
					// 1 0 2  ~=  0 0 1
					// . 1 .      . 0 .

					// tap 2 pixels and see which ones are "outside" the edge, to
					// determine if the edge is vertical or horizontal

					vec4 rgbaAlongH = FxaaTexOff(tex, posM, vec2( dirToEdge.x, -dirToEdge.y ), fxaaQualityRcpFrame.xy);
					float matchAlongH = contrast( rgbaM, rgbaAlongH );
					// . 1 .
					// 0 0 1
					// . 0 H

					vec4 rgbaAlongV = FxaaTexOff(tex, posM, vec2( -dirToEdge.x, dirToEdge.y ), fxaaQualityRcpFrame.xy);
					float matchAlongV = contrast( rgbaM, rgbaAlongV );
					// V 1 .
					// 0 0 1
					// . 0 .

					relativeVContrast = matchAlongV - matchAlongH;
					relativeVContrast *= fxaaQualityinvEdgeThreshold;

					if( abs( relativeVContrast ) < .3 ) { // 45 deg edge
							// 1 1 .
							// 0 0 1
							// . 0 1

							// do a simple blur
							return mix(
									rgbaM,
									(rgbaN + rgbaS + rgbaE + rgbaW) * .25,
									.4
							);
					}

					horzSpan = relativeVContrast > 0.;
			}

			if(!horzSpan) rgbaN = rgbaW;
			if(!horzSpan) rgbaS = rgbaE;
			// . 0 .      1
			// 1 0 1  ->  0
			// . 0 .      1

			bool pairN = contrast( rgbaM, rgbaN ) > contrast( rgbaM, rgbaS );
			if(!pairN) rgbaN = rgbaS;

			vec2 offNP;
			offNP.x = (!horzSpan) ? 0.0 : fxaaQualityRcpFrame.x;
			offNP.y = ( horzSpan) ? 0.0 : fxaaQualityRcpFrame.y;

			bool doneN = false;
			bool doneP = false;

			float nDist = 0.;
			float pDist = 0.;

			vec2 posN = posM;
			vec2 posP = posM;

			int iterationsUsed = 0;
			int iterationsUsedN = 0;
			int iterationsUsedP = 0;
			for( int i = 0; i < NUM_SAMPLES; i++ ) {
					iterationsUsed = i;

					float increment = float(i + 1);

					if(!doneN) {
							nDist += increment;
							posN = posM + offNP * nDist;
							vec4 rgbaEndN = FxaaTexTop(tex, posN.xy);
							doneN = contrast( rgbaEndN, rgbaM ) > contrast( rgbaEndN, rgbaN );
							iterationsUsedN = i;
					}

					if(!doneP) {
							pDist += increment;
							posP = posM - offNP * pDist;
							vec4 rgbaEndP = FxaaTexTop(tex, posP.xy);
							doneP = contrast( rgbaEndP, rgbaM ) > contrast( rgbaEndP, rgbaN );
							iterationsUsedP = i;
					}

					if(doneN || doneP) break;
			}


			if ( !doneP && !doneN ) return rgbaM; // failed to find end of edge

			float dist = min(
					doneN ? float( iterationsUsedN ) / float( NUM_SAMPLES - 1 ) : 1.,
					doneP ? float( iterationsUsedP ) / float( NUM_SAMPLES - 1 ) : 1.
			);

			// hacky way of reduces blurriness of mostly diagonal edges
			// but reduces AA quality
			dist = pow(dist, .5);

			dist = 1. - dist;

			return mix(
					rgbaM,
					rgbaN,
					dist * .5
			);
	}

	void main() {
			const float edgeDetectionQuality = .2;
			const float invEdgeDetectionQuality = 1. / edgeDetectionQuality;

			gl_FragColor = FxaaPixelShader(
					vUv,
					tDiffuse,
					resolution,
					edgeDetectionQuality, // [0,1] contrast needed, otherwise early discard
					invEdgeDetectionQuality
			);

	}
	`
};
class PlayerAnimation {
  constructor() {
    Object.defineProperty(this, "speed", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 1
    });
    Object.defineProperty(this, "paused", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "progress", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "currentId", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "progress0", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: /* @__PURE__ */ new Map()
    });
    Object.defineProperty(this, "animationObjects", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: /* @__PURE__ */ new Map()
    });
  }
  /**
   * Plays the animation, and update the progress.
   *
   * The elapsed time `deltaTime` will be scaled by {@link speed}.
   * If {@link paused} is `true`, this method will do nothing.
   *
   * @param player - the player object
   * @param deltaTime - time elapsed since last call
   */
  update(player, deltaTime) {
    if (this.paused) {
      return;
    }
    const delta = deltaTime * this.speed;
    this.animate(player, delta);
    this.animationObjects.forEach((animation, id) => {
      const progress0 = this.progress0.get(id);
      animation(player, this.progress - progress0, id);
    });
    this.progress += delta;
  }
  /**
   * Adds a new animation based on the original animation and returns its id.
   *
   * @param fn - The animation function to be added, which takes a player object and progress value.When calling addAnimation. progress is 0.
   * @returns The id of the newly added animation.
   *
   * @example
   * Rotate the player while playing the idle animation.
   * ```
   * skinViewer.animation = new skinview3d.IdleAnimation();
   * skinViewer.animation.addAnimation((player, progress)=>player.rotation.y = progress);
   * ```
   */
  addAnimation(fn) {
    const id = this.currentId++;
    this.progress0.set(id, this.progress);
    this.animationObjects.set(id, fn);
    return id;
  }
  /**
   * Removes an animation created by the addAnimation method by its id.
   *
   * If the id is undefined, this method will do nothing.
   *
   * @param id - The id of the animation to remove.
   *
   * @example
   * Rotate the player then stop and reset the rotation after 1s.
   * ```
   * var r;
   * r=skinViewer.animation.addAnimation((pl, pr) => {
   * 	pl.rotation.x = pr;
   * });
   * setTimeout(()=>{
   * 	skinViewer.animation.addAnimation((pl, pr,id) => {
   * 		pl.rotation.x=0;
   * 		skinViewer.animation.removeAnimation(id);
   * 	})
   * 	skinViewer.animation.removeAnimation(r);
   * },1000)
   * ```
   */
  removeAnimation(id) {
    if (id != void 0) {
      this.animationObjects.delete(id);
      this.progress0.delete(id);
    }
  }
}
class FunctionAnimation extends PlayerAnimation {
  constructor(fn) {
    super();
    Object.defineProperty(this, "fn", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.fn = fn;
  }
  animate(player, delta) {
    this.fn(player, this.progress, delta);
  }
}
class IdleAnimation extends PlayerAnimation {
  animate(player) {
    const t = this.progress * 2;
    const basicArmRotationZ = Math.PI * 0.02;
    player.skin.leftArm.rotation.z = Math.cos(t) * 0.03 + basicArmRotationZ;
    player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * 0.03 - basicArmRotationZ;
    const basicCapeRotationX = Math.PI * 0.06;
    player.cape.rotation.x = Math.sin(t) * 0.01 + basicCapeRotationX;
  }
}
class WalkingAnimation extends PlayerAnimation {
  constructor() {
    super(...arguments);
    Object.defineProperty(this, "headBobbing", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: true
    });
  }
  animate(player) {
    const t = this.progress * 8;
    player.skin.leftLeg.rotation.x = Math.sin(t) * 0.5;
    player.skin.rightLeg.rotation.x = Math.sin(t + Math.PI) * 0.5;
    player.skin.leftArm.rotation.x = Math.sin(t + Math.PI) * 0.5;
    player.skin.rightArm.rotation.x = Math.sin(t) * 0.5;
    const basicArmRotationZ = Math.PI * 0.02;
    player.skin.leftArm.rotation.z = Math.cos(t) * 0.03 + basicArmRotationZ;
    player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * 0.03 - basicArmRotationZ;
    if (this.headBobbing) {
      player.skin.head.rotation.y = Math.sin(t / 4) * 0.2;
      player.skin.head.rotation.x = Math.sin(t / 5) * 0.1;
    } else {
      player.skin.head.rotation.y = 0;
      player.skin.head.rotation.x = 0;
    }
    const basicCapeRotationX = Math.PI * 0.06;
    player.cape.rotation.x = Math.sin(t / 1.5) * 0.06 + basicCapeRotationX;
  }
}
class RunningAnimation extends PlayerAnimation {
  animate(player) {
    const t = this.progress * 15 + Math.PI * 0.5;
    player.skin.leftLeg.rotation.x = Math.cos(t + Math.PI) * 1.3;
    player.skin.rightLeg.rotation.x = Math.cos(t) * 1.3;
    player.skin.leftArm.rotation.x = Math.cos(t) * 1.5;
    player.skin.rightArm.rotation.x = Math.cos(t + Math.PI) * 1.5;
    const basicArmRotationZ = Math.PI * 0.1;
    player.skin.leftArm.rotation.z = Math.cos(t) * 0.1 + basicArmRotationZ;
    player.skin.rightArm.rotation.z = Math.cos(t + Math.PI) * 0.1 - basicArmRotationZ;
    player.position.y = Math.cos(t * 2);
    player.position.x = Math.cos(t) * 0.15;
    player.rotation.z = Math.cos(t + Math.PI) * 0.01;
    const basicCapeRotationX = Math.PI * 0.3;
    player.cape.rotation.x = Math.sin(t * 2) * 0.1 + basicCapeRotationX;
  }
}
function clamp(num, min, max) {
  return num <= min ? min : num >= max ? max : num;
}
class FlyingAnimation extends PlayerAnimation {
  animate(player) {
    const t = this.progress > 0 ? this.progress * 20 : 0;
    const startProgress = clamp(t * t / 100, 0, 1);
    player.rotation.x = startProgress * Math.PI / 2;
    player.skin.head.rotation.x = startProgress > 0.5 ? Math.PI / 4 - player.rotation.x : 0;
    const basicArmRotationZ = Math.PI * 0.25 * startProgress;
    player.skin.leftArm.rotation.z = basicArmRotationZ;
    player.skin.rightArm.rotation.z = -basicArmRotationZ;
    const elytraRotationX = 0.34906584;
    const elytraRotationZ = Math.PI / 2;
    const interpolation = Math.pow(0.9, t);
    player.elytra.leftWing.rotation.x = elytraRotationX + interpolation * (0.2617994 - elytraRotationX);
    player.elytra.leftWing.rotation.z = elytraRotationZ + interpolation * (0.2617994 - elytraRotationZ);
    player.elytra.updateRightWing();
  }
}
class WaveAnimation extends PlayerAnimation {
  constructor(whichArm = "left") {
    super();
    Object.defineProperty(this, "whichArm", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.whichArm = whichArm;
  }
  animate(player) {
    const t = this.progress * 2 * Math.PI * 0.5;
    const targetArm = this.whichArm === "left" ? player.skin.leftArm : player.skin.rightArm;
    targetArm.rotation.x = 180;
    targetArm.rotation.z = Math.sin(t) * 0.5;
  }
}
class CrouchAnimation extends PlayerAnimation {
  constructor() {
    super(...arguments);
    Object.defineProperty(this, "showProgress", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "runOnce", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "isRunningHitAnimation", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "hitAnimationSpeed", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 1
    });
    Object.defineProperty(this, "erp", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 0
    });
    Object.defineProperty(this, "isCrouched", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
  }
  /**
   * Add the hit animation.
   *
   * @param speed - The speed of hit animation and the default is follow the speed of CrouchAnimation.But if the speed of CrouchAnimation is 0,this animation will not run.
   */
  addHitAnimation(speed = this.speed) {
    this.isRunningHitAnimation = true;
    this.hitAnimationSpeed = speed;
  }
  animate(player) {
    let pr = this.progress * 8;
    if (pr === 0) {
      this.isCrouched = void 0;
    }
    if (this.runOnce) {
      pr = clamp(pr, -1, 1);
    }
    if (!this.showProgress) {
      pr = Math.floor(pr);
    }
    player.skin.body.rotation.x = 0.4537860552 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.skin.body.position.z = 1.3256181 * Math.abs(Math.sin(pr * Math.PI / 2)) - 3.4500310377 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.skin.body.position.y = -6 - 2.103677462 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.cape.position.y = 8 - 1.851236166577372 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.cape.rotation.x = 10.8 * Math.PI / 180 + 0.294220265771 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.cape.position.z = -2 + 3.786619432 * Math.abs(Math.sin(pr * Math.PI / 2)) - 3.4500310377 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.elytra.position.x = player.cape.position.x;
    player.elytra.position.y = player.cape.position.y;
    player.elytra.position.z = player.cape.position.z;
    player.elytra.rotation.x = player.cape.rotation.x - 10.8 * Math.PI / 180;
    const pr1 = this.progress / this.speed;
    if (Math.abs(Math.sin(pr * Math.PI / 2)) === 1 || this.showProgress && Math.floor(Math.abs(pr)) % 2 === 0) {
      this.erp = !this.isCrouched ? pr1 : this.erp;
      this.isCrouched = true;
      player.elytra.leftWing.rotation.z = 0.26179944 + 0.4582006 * Math.abs(Math.sin(Math.min(pr1 - this.erp, 1) * Math.PI / 2));
      player.elytra.leftWing.rotation.y = 0.3 * Math.abs(Math.sin(Math.min(pr1 - this.erp, 1) * Math.PI / 2));
      player.elytra.updateRightWing();
    } else if (this.isCrouched !== void 0) {
      this.erp = this.isCrouched ? pr1 : this.erp;
      player.elytra.leftWing.rotation.z = 0.72 - 0.4582006 * Math.abs(Math.sin(Math.min(pr1 - this.erp, 1) * Math.PI / 2));
      player.elytra.leftWing.rotation.y = 0.3 - 0.3 * Math.abs(Math.sin(Math.min(pr1 - this.erp, 1) * Math.PI / 2));
      player.elytra.updateRightWing();
      this.isCrouched = false;
    }
    player.skin.head.position.y = -3.618325234674 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.skin.leftArm.position.z = 3.618325234674 * Math.abs(Math.sin(pr * Math.PI / 2)) - 3.4500310377 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.skin.rightArm.position.z = player.skin.leftArm.position.z;
    player.skin.leftArm.rotation.x = 0.410367746202 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.skin.rightArm.rotation.x = player.skin.leftArm.rotation.x;
    player.skin.leftArm.rotation.z = 0.1;
    player.skin.rightArm.rotation.z = -player.skin.leftArm.rotation.z;
    player.skin.leftArm.position.y = -2 - 2.53943318 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.skin.rightArm.position.y = player.skin.leftArm.position.y;
    player.skin.rightLeg.position.z = -3.4500310377 * Math.abs(Math.sin(pr * Math.PI / 2));
    player.skin.leftLeg.position.z = player.skin.rightLeg.position.z;
    if (this.isRunningHitAnimation) {
      const pr2 = this.progress;
      let t = this.progress * 18 * this.hitAnimationSpeed / this.speed;
      if (this.speed == 0) {
        t = 0;
      }
      const isCrouching = Math.abs(Math.sin(pr2 * Math.PI / 2)) === 1;
      player.skin.rightArm.rotation.x = -0.4537860552 + 2 * Math.sin(t + Math.PI) * 0.3 - (isCrouching ? 0.4537860552 : 0);
      const basicArmRotationZ = 0.01 * Math.PI + 0.06;
      player.skin.rightArm.rotation.z = -Math.cos(t) * 0.403 + basicArmRotationZ;
      player.skin.body.rotation.y = -Math.cos(t) * 0.06;
      player.skin.leftArm.rotation.x = Math.sin(t + Math.PI) * 0.077 + (isCrouching ? 0.47 : 0);
      player.skin.leftArm.rotation.z = -Math.cos(t) * 0.015 + 0.13 - (!isCrouching ? 0.05 : 0);
      if (!isCrouching) {
        player.skin.leftArm.position.z = Math.cos(t) * 0.3;
        player.skin.leftArm.position.x = 5 - Math.cos(t) * 0.05;
      }
    }
  }
}
class HitAnimation extends PlayerAnimation {
  animate(player) {
    const t = this.progress * 18;
    player.skin.rightArm.rotation.x = -0.4537860552 * 2 + 2 * Math.sin(t + Math.PI) * 0.3;
    const basicArmRotationZ = 0.01 * Math.PI + 0.06;
    player.skin.rightArm.rotation.z = -Math.cos(t) * 0.403 + basicArmRotationZ;
    player.skin.body.rotation.y = -Math.cos(t) * 0.06;
    player.skin.leftArm.rotation.x = Math.sin(t + Math.PI) * 0.077;
    player.skin.leftArm.rotation.z = -Math.cos(t) * 0.015 + 0.13 - 0.05;
    player.skin.leftArm.position.z = Math.cos(t) * 0.3;
    player.skin.leftArm.position.x = 5 - Math.cos(t) * 0.05;
  }
}
class SwimAnimation extends PlayerAnimation {
  constructor() {
    super(...arguments);
    Object.defineProperty(this, "lock", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
  }
  animate(player) {
    if (this.progress === 0) {
      this.lock = false;
    }
    const period = 1.3;
    const t = this.progress % period;
    const phase = t / period;
    const times = [0, 0.7 / period, 1.1 / period, 1];
    const leftEulerDeg = [
      { z: 180, y: 180, x: 0 },
      { z: 287.2, y: 180, x: 0 },
      { z: 180, y: 180, x: 90 },
      { z: 180, y: 180, x: 0 }
    ];
    const rightEulerDeg = [
      { z: -180, y: 180, x: 0 },
      { z: -287.2, y: 180, x: 0 },
      { z: -180, y: 180, x: 90 },
      { z: -180, y: 180, x: 0 }
    ];
    const toRad = Math.PI / 180;
    function eulerZYXToQuat(z, y, x) {
      const qz = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), z);
      const qy = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), y);
      const qx = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), x);
      return qx.multiply(qy).multiply(qz);
    }
    const leftQuats = leftEulerDeg.map((e) => eulerZYXToQuat(e.z * toRad, e.y * toRad, e.x * toRad));
    const rightQuats = rightEulerDeg.map((e) => eulerZYXToQuat(e.z * toRad, e.y * toRad, e.x * toRad));
    function findSegment(t2) {
      for (let i2 = 0; i2 < times.length - 1; i2++) {
        if (t2 >= times[i2] && t2 <= times[i2 + 1]) {
          return { i: i2, t0: times[i2], t1: times[i2 + 1] };
        }
      }
      return { i: times.length - 2, t0: times[times.length - 2], t1: times[times.length - 1] };
    }
    const seg = findSegment(phase);
    const p = (phase - seg.t0) / (seg.t1 - seg.t0);
    const i = seg.i;
    if (!this.lock) {
      let k = 1.3;
      if (i == 0 && p * k < 1) {
        player.position.y = -5 * p * k;
        player.rotation.x = 1.3 * p * Math.PI / 2;
        player.skin.head.rotation.x = -Math.PI / 4 * p * k;
        player.cape.rotation.x = Math.PI / 4 * p * k;
      } else {
        this.lock = true;
      }
    }
    const qLeft = new Quaternion().copy(leftQuats[i]).slerp(leftQuats[i + 1], p);
    const qRight = new Quaternion().copy(rightQuats[i]).slerp(rightQuats[i + 1], p);
    player.skin.leftArm.quaternion.copy(qLeft);
    player.skin.rightArm.quaternion.copy(qRight);
    const legFreq = 390 * toRad;
    const legAmp = 17.2 * toRad;
    const leftLegX = legAmp * Math.cos(this.progress * legFreq + Math.PI);
    const rightLegX = legAmp * Math.cos(this.progress * legFreq);
    player.skin.leftLeg.rotation.x = leftLegX;
    player.skin.leftLeg.rotation.y = -0.1 * toRad;
    player.skin.leftLeg.rotation.z = -0.1 * toRad;
    player.skin.rightLeg.rotation.x = rightLegX;
    player.skin.rightLeg.rotation.y = 0.1 * toRad;
    player.skin.rightLeg.rotation.z = 0.1 * toRad;
  }
}
class NameTagObject extends Sprite {
  constructor(text = "", options = {}) {
    const material = new SpriteMaterial({
      transparent: true,
      alphaTest: 1e-5
    });
    super(material);
    Object.defineProperty(this, "painted", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "text", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "font", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "margin", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "textStyle", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "backgroundStyle", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "height", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "textMaterial", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    this.textMaterial = material;
    this.text = text;
    this.font = options.font === void 0 ? "48px Minecraft" : options.font;
    this.margin = options.margin === void 0 ? [5, 10, 5, 10] : options.margin;
    this.textStyle = options.textStyle === void 0 ? "white" : options.textStyle;
    this.backgroundStyle = options.backgroundStyle === void 0 ? "rgba(0,0,0,.25)" : options.backgroundStyle;
    this.height = options.height === void 0 ? 4 : options.height;
    const repaintAfterLoaded = options.repaintAfterLoaded === void 0 ? true : options.repaintAfterLoaded;
    if (repaintAfterLoaded && !document.fonts.check(this.font, this.text)) {
      this.paint();
      this.painted = this.loadAndPaint();
    } else {
      this.paint();
      this.painted = Promise.resolve();
    }
  }
  async loadAndPaint() {
    await document.fonts.load(this.font, this.text);
    this.paint();
  }
  paint() {
    const canvas = document.createElement("canvas");
    let ctx = canvas.getContext("2d");
    ctx.font = this.font;
    const metrics = ctx.measureText(this.text);
    canvas.width = this.margin[3] + metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight + this.margin[1];
    canvas.height = this.margin[0] + metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent + this.margin[2];
    ctx = canvas.getContext("2d");
    ctx.font = this.font;
    ctx.fillStyle = this.backgroundStyle;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = this.textStyle;
    ctx.fillText(this.text, this.margin[3] + metrics.actualBoundingBoxLeft, this.margin[0] + metrics.actualBoundingBoxAscent);
    const texture = new CanvasTexture(canvas);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    this.textMaterial.map = texture;
    this.textMaterial.needsUpdate = true;
    this.scale.x = canvas.width / canvas.height * this.height;
    this.scale.y = this.height;
  }
}
class SkinViewer {
  constructor(options = {}) {
    Object.defineProperty(this, "canvas", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "scene", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "camera", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "renderer", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "controls", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "playerObject", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "playerWrapper", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "globalLight", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: new AmbientLight(16777215, 3)
    });
    Object.defineProperty(this, "cameraLight", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: new PointLight(16777215, 0.6)
    });
    Object.defineProperty(this, "composer", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "renderPass", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "fxaaPass", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "skinCanvas", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "capeCanvas", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "earsCanvas", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "skinTexture", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: null
    });
    Object.defineProperty(this, "capeTexture", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: null
    });
    Object.defineProperty(this, "earsTexture", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: null
    });
    Object.defineProperty(this, "backgroundTexture", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: null
    });
    Object.defineProperty(this, "_disposed", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "_renderPaused", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "_zoom", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "isUserRotating", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "autoRotate", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: false
    });
    Object.defineProperty(this, "autoRotateSpeed", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 1
    });
    Object.defineProperty(this, "_animation", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "clock", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "animationID", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "onContextLost", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "onContextRestored", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_pixelRatio", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "devicePixelRatioQuery", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "onDevicePixelRatioChange", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "_nameTag", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: null
    });
    Object.defineProperty(this, "nameTagYOffset", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: 20
    });
    this.canvas = options.canvas === void 0 ? document.createElement("canvas") : options.canvas;
    this.skinCanvas = document.createElement("canvas");
    this.capeCanvas = document.createElement("canvas");
    this.earsCanvas = document.createElement("canvas");
    this.scene = new Scene();
    this.camera = new PerspectiveCamera();
    this.camera.add(this.cameraLight);
    this.scene.add(this.camera);
    this.scene.add(this.globalLight);
    ColorManagement.enabled = false;
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      preserveDrawingBuffer: options.preserveDrawingBuffer === true
      // default: false
    });
    this.onDevicePixelRatioChange = () => {
      this.renderer.setPixelRatio(window.devicePixelRatio);
      this.updateComposerSize();
      if (this._pixelRatio === "match-device") {
        this.devicePixelRatioQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        this.devicePixelRatioQuery.addEventListener("change", this.onDevicePixelRatioChange, { once: true });
      }
    };
    if (options.pixelRatio === void 0 || options.pixelRatio === "match-device") {
      this._pixelRatio = "match-device";
      this.devicePixelRatioQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      this.devicePixelRatioQuery.addEventListener("change", this.onDevicePixelRatioChange, { once: true });
      this.renderer.setPixelRatio(window.devicePixelRatio);
    } else {
      this._pixelRatio = options.pixelRatio;
      this.devicePixelRatioQuery = null;
      this.renderer.setPixelRatio(options.pixelRatio);
    }
    this.renderer.setClearColor(0, 0);
    let renderTarget;
    if (this.renderer.capabilities.isWebGL2) {
      renderTarget = new WebGLRenderTarget(0, 0, {
        depthTexture: new DepthTexture(0, 0, FloatType)
      });
    }
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.fxaaPass);
    this.playerObject = new PlayerObject();
    this.playerObject.name = "player";
    this.playerObject.skin.visible = false;
    this.playerObject.cape.visible = false;
    this.playerWrapper = new Group();
    this.playerWrapper.add(this.playerObject);
    this.scene.add(this.playerWrapper);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enablePan = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 256;
    if (options.enableControls === false) {
      this.controls.enabled = false;
    }
    if (options.skin !== void 0) {
      this.loadSkin(options.skin, {
        model: options.model,
        ears: options.ears === "current-skin"
      });
    }
    if (options.cape !== void 0) {
      this.loadCape(options.cape);
    }
    if (options.ears !== void 0 && options.ears !== "current-skin") {
      this.loadEars(options.ears.source, {
        textureType: options.ears.textureType
      });
    }
    if (options.width !== void 0) {
      this.width = options.width;
    }
    if (options.height !== void 0) {
      this.height = options.height;
    }
    if (options.background !== void 0) {
      this.background = options.background;
    }
    if (options.panorama !== void 0) {
      this.loadPanorama(options.panorama);
    }
    if (options.nameTag !== void 0) {
      this.nameTag = options.nameTag;
    }
    this.camera.position.z = 1;
    this._zoom = options.zoom === void 0 ? 0.9 : options.zoom;
    this.fov = options.fov === void 0 ? 50 : options.fov;
    this._animation = options.animation === void 0 ? null : options.animation;
    this.clock = new Clock();
    if (options.renderPaused === true) {
      this._renderPaused = true;
      this.animationID = null;
    } else {
      this.animationID = window.requestAnimationFrame(() => this.draw());
    }
    this.onContextLost = (event) => {
      event.preventDefault();
      if (this.animationID !== null) {
        window.cancelAnimationFrame(this.animationID);
        this.animationID = null;
      }
    };
    this.onContextRestored = () => {
      this.renderer.setClearColor(0, 0);
      if (!this._renderPaused && !this._disposed && this.animationID === null) {
        this.animationID = window.requestAnimationFrame(() => this.draw());
      }
    };
    this.canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    this.canvas.addEventListener("mousedown", () => {
      this.isUserRotating = true;
    }, false);
    this.canvas.addEventListener("mouseup", () => {
      this.isUserRotating = false;
    }, false);
    this.canvas.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1) {
        this.isUserRotating = true;
      } else {
        this.isUserRotating = false;
      }
    }, false);
    this.canvas.addEventListener("touchend", () => {
      this.isUserRotating = false;
    }, false);
  }
  updateComposerSize() {
    this.composer.setSize(this.width, this.height);
    const pixelRatio = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pixelRatio);
    this.fxaaPass.material.uniforms["resolution"].value.x = 1 / (this.width * pixelRatio);
    this.fxaaPass.material.uniforms["resolution"].value.y = 1 / (this.height * pixelRatio);
  }
  recreateSkinTexture() {
    if (this.skinTexture !== null) {
      this.skinTexture.dispose();
    }
    this.skinTexture = new CanvasTexture(this.skinCanvas);
    this.skinTexture.magFilter = NearestFilter;
    this.skinTexture.minFilter = NearestFilter;
    this.playerObject.skin.map = this.skinTexture;
  }
  recreateCapeTexture() {
    if (this.capeTexture !== null) {
      this.capeTexture.dispose();
    }
    this.capeTexture = new CanvasTexture(this.capeCanvas);
    this.capeTexture.magFilter = NearestFilter;
    this.capeTexture.minFilter = NearestFilter;
    this.playerObject.cape.map = this.capeTexture;
    this.playerObject.elytra.map = this.capeTexture;
  }
  recreateEarsTexture() {
    if (this.earsTexture !== null) {
      this.earsTexture.dispose();
    }
    this.earsTexture = new CanvasTexture(this.earsCanvas);
    this.earsTexture.magFilter = NearestFilter;
    this.earsTexture.minFilter = NearestFilter;
    this.playerObject.ears.map = this.earsTexture;
  }
  loadSkin(source, options = {}) {
    if (source === null) {
      this.resetSkin();
    } else if (isTextureSource(source)) {
      loadSkinToCanvas(this.skinCanvas, source);
      this.recreateSkinTexture();
      if (options.model === void 0 || options.model === "auto-detect") {
        this.playerObject.skin.modelType = inferModelType(this.skinCanvas);
      } else {
        this.playerObject.skin.modelType = options.model;
      }
      if (options.makeVisible !== false) {
        this.playerObject.skin.visible = true;
      }
      if (options.ears === true || options.ears == "load-only") {
        loadEarsToCanvasFromSkin(this.earsCanvas, source);
        this.recreateEarsTexture();
        if (options.ears === true) {
          this.playerObject.ears.visible = true;
          if (this._nameTag) {
            this.nameTagYOffset = 25;
            this._nameTag.position.y = this.nameTagYOffset;
          }
        }
      }
    } else {
      return loadImage(source).then((image) => this.loadSkin(image, options));
    }
  }
  resetSkin() {
    this.playerObject.skin.visible = false;
    this.playerObject.skin.map = null;
    if (this.skinTexture !== null) {
      this.skinTexture.dispose();
      this.skinTexture = null;
    }
  }
  loadCape(source, options = {}) {
    if (source === null) {
      this.resetCape();
    } else if (isTextureSource(source)) {
      loadCapeToCanvas(this.capeCanvas, source);
      this.recreateCapeTexture();
      if (options.makeVisible !== false) {
        this.playerObject.backEquipment = options.backEquipment === void 0 ? "cape" : options.backEquipment;
      }
    } else {
      return loadImage(source).then((image) => this.loadCape(image, options));
    }
  }
  resetCape() {
    this.playerObject.backEquipment = null;
    this.playerObject.cape.map = null;
    this.playerObject.elytra.map = null;
    if (this.capeTexture !== null) {
      this.capeTexture.dispose();
      this.capeTexture = null;
    }
  }
  loadEars(source, options = {}) {
    if (source === null) {
      this.resetEars();
    } else if (isTextureSource(source)) {
      if (options.textureType === "skin") {
        loadEarsToCanvasFromSkin(this.earsCanvas, source);
      } else {
        loadEarsToCanvas(this.earsCanvas, source);
      }
      this.recreateEarsTexture();
      if (options.makeVisible !== false) {
        this.playerObject.ears.visible = true;
        if (this._nameTag) {
          this.nameTagYOffset = 25;
          this._nameTag.position.y = this.nameTagYOffset;
        }
      }
    } else {
      return loadImage(source).then((image) => this.loadEars(image, options));
    }
  }
  resetEars() {
    this.playerObject.ears.visible = false;
    if (this._nameTag) {
      this.nameTagYOffset = 20;
      this._nameTag.position.y = this.nameTagYOffset;
    }
    this.playerObject.ears.map = null;
    if (this.earsTexture !== null) {
      this.earsTexture.dispose();
      this.earsTexture = null;
    }
  }
  loadPanorama(source) {
    return this.loadBackground(source, EquirectangularReflectionMapping);
  }
  loadBackground(source, mapping) {
    if (isTextureSource(source)) {
      if (this.backgroundTexture !== null) {
        this.backgroundTexture.dispose();
      }
      this.backgroundTexture = new Texture();
      this.backgroundTexture.image = source;
      if (mapping !== void 0) {
        this.backgroundTexture.mapping = mapping;
      }
      this.backgroundTexture.needsUpdate = true;
      this.scene.background = this.backgroundTexture;
    } else {
      return loadImage(source).then((image) => this.loadBackground(image, mapping));
    }
  }
  draw() {
    const dt = this.clock.getDelta();
    if (this._animation !== null) {
      this._animation.update(this.playerObject, dt);
      if (this._nameTag) {
        this._nameTag.position.y = this.playerObject.skin.head.getWorldPosition(new Vector3()).y + this.nameTagYOffset - 8;
      }
    }
    if (this.autoRotate) {
      if (!(this.controls.enableRotate && this.isUserRotating)) {
        this.playerWrapper.rotation.y += dt * this.autoRotateSpeed;
      }
    }
    this.controls.update();
    this.render();
    this.animationID = window.requestAnimationFrame(() => this.draw());
  }
  /**
   * Renders the scene to the canvas.
   * This method does not change the animation progress.
   */
  render() {
    this.composer.render();
  }
  setSize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.updateComposerSize();
  }
  dispose() {
    this._disposed = true;
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored, false);
    if (this.devicePixelRatioQuery !== null) {
      this.devicePixelRatioQuery.removeEventListener("change", this.onDevicePixelRatioChange);
      this.devicePixelRatioQuery = null;
    }
    if (this.animationID !== null) {
      window.cancelAnimationFrame(this.animationID);
      this.animationID = null;
    }
    this.controls.dispose();
    this.renderer.dispose();
    this.resetSkin();
    this.resetCape();
    this.resetEars();
    this.background = null;
    this.fxaaPass.fsQuad.dispose();
  }
  get disposed() {
    return this._disposed;
  }
  /**
   * Whether rendering and animations are paused.
   * Setting this property to true will stop both rendering and animation loops.
   * Setting it back to false will resume them.
   */
  get renderPaused() {
    return this._renderPaused;
  }
  set renderPaused(value) {
    this._renderPaused = value;
    if (this._renderPaused && this.animationID !== null) {
      window.cancelAnimationFrame(this.animationID);
      this.animationID = null;
      this.clock.stop();
      this.clock.autoStart = true;
    } else if (!this._renderPaused && !this._disposed && !this.renderer.getContext().isContextLost() && this.animationID == null) {
      this.animationID = window.requestAnimationFrame(() => this.draw());
    }
  }
  get width() {
    return this.renderer.getSize(new Vector2()).width;
  }
  set width(newWidth) {
    this.setSize(newWidth, this.height);
  }
  get height() {
    return this.renderer.getSize(new Vector2()).height;
  }
  set height(newHeight) {
    this.setSize(this.width, newHeight);
  }
  get background() {
    return this.scene.background;
  }
  set background(value) {
    if (value === null || value instanceof Color || value instanceof Texture) {
      this.scene.background = value;
    } else {
      this.scene.background = new Color(value);
    }
    if (this.backgroundTexture !== null && value !== this.backgroundTexture) {
      this.backgroundTexture.dispose();
      this.backgroundTexture = null;
    }
  }
  adjustCameraDistance() {
    let distance = 4.5 + 16.5 / Math.tan(this.fov / 180 * Math.PI / 2) / this.zoom;
    if (distance < 10) {
      distance = 10;
    } else if (distance > 256) {
      distance = 256;
    }
    this.camera.position.multiplyScalar(distance / this.camera.position.length());
    this.camera.updateProjectionMatrix();
  }
  resetCameraPose() {
    this.camera.position.set(0, 0, 1);
    this.camera.rotation.set(0, 0, 0);
    this.adjustCameraDistance();
  }
  get fov() {
    return this.camera.fov;
  }
  set fov(value) {
    this.camera.fov = value;
    this.adjustCameraDistance();
  }
  get zoom() {
    return this._zoom;
  }
  set zoom(value) {
    this._zoom = value;
    this.adjustCameraDistance();
  }
  get pixelRatio() {
    return this._pixelRatio;
  }
  set pixelRatio(newValue) {
    if (newValue === "match-device") {
      if (this._pixelRatio !== "match-device") {
        this._pixelRatio = newValue;
        this.onDevicePixelRatioChange();
      }
    } else {
      if (this._pixelRatio === "match-device" && this.devicePixelRatioQuery !== null) {
        this.devicePixelRatioQuery.removeEventListener("change", this.onDevicePixelRatioChange);
        this.devicePixelRatioQuery = null;
      }
      this._pixelRatio = newValue;
      this.renderer.setPixelRatio(newValue);
      this.updateComposerSize();
    }
  }
  /**
   * The animation that is current playing, or `null` if no animation is playing.
   *
   * Setting this property to a different value will change the current animation.
   * The player's pose and the progress of the new animation will be reset before playing.
   *
   * Setting this property to `null` will stop the current animation and reset the player's pose.
   */
  get animation() {
    return this._animation;
  }
  set animation(animation) {
    if (this._animation !== animation) {
      this.playerObject.resetJoints();
      this.playerObject.position.set(0, 0, 0);
      this.playerObject.rotation.set(0, 0, 0);
      if (this._nameTag) {
        this._nameTag.position.y = this.nameTagYOffset;
      }
      this.clock.stop();
      this.clock.autoStart = true;
    }
    if (animation !== null) {
      animation.progress = 0;
    }
    this._animation = animation;
  }
  /**
   * The name tag to display above the player, or `null` if there is none.
   *
   * When setting this property to a `string` value, a {@link NameTagObject}
   * will be automatically created with default options.
   *
   * @example
   * ```
   * skinViewer.nameTag = "hello";
   * skinViewer.nameTag = new NameTagObject("hello", { textStyle: "yellow" });
   * skinViewer.nameTag = null;
   * ```
   */
  get nameTag() {
    return this._nameTag;
  }
  set nameTag(newVal) {
    if (this._nameTag !== null) {
      this.playerWrapper.remove(this._nameTag);
    }
    if (newVal !== null) {
      if (!(newVal instanceof Object3D)) {
        newVal = new NameTagObject(newVal);
      }
      this.playerWrapper.add(newVal);
      this.nameTagYOffset = this.playerObject.ears.visible ? 25 : 20;
      newVal.position.y = this.nameTagYOffset;
    }
    this._nameTag = newVal;
  }
}
export {
  BodyPart,
  CapeObject,
  CrouchAnimation,
  EarsObject,
  ElytraObject,
  FlyingAnimation,
  FunctionAnimation,
  HitAnimation,
  IdleAnimation,
  NameTagObject,
  PlayerAnimation,
  PlayerObject,
  RunningAnimation,
  SkinObject,
  SkinViewer,
  SwimAnimation,
  WalkingAnimation,
  WaveAnimation
};
