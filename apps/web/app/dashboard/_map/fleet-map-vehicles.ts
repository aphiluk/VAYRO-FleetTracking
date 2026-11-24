import { MercatorCoordinate, type CustomLayerInterface, type Map as MapLibreMap } from "maplibre-gl";
import {
  AmbientLight, BoxGeometry, Camera, CylinderGeometry, DirectionalLight, Group,
  Matrix4, Mesh, MeshLambertMaterial, Scene, WebGLRenderer,
} from "three";
import { DEMO_CENTER, type VehicleCategory } from "../_data/fleet-demo";
import { hasVehicleModel, type MapVehicle } from "../_data/map-vehicle";

type Dimensions = [width: number, length: number, height: number];
type Point = [x: number, y: number, z: number];

const sizes = {
  truck: { length: 8.4, pixels: 43 },
  car: { length: 4.5, pixels: 35 },
  motorcycle: { length: 2.3, pixels: 29 },
} satisfies Record<VehicleCategory, { length: number; pixels: number }>;

function createVehicleAssets() {
  const boxGeometry = new BoxGeometry(1, 1, 1);
  const wheelGeometry = new CylinderGeometry(0.5, 0.5, 1, 14);
  const material = (color: string) => new MeshLambertMaterial({ color });
  const cargo = material("#e0ecf6");
  const truckPaint = material("#278ee3");
  const carPaint = material("#24c9a3");
  const bikePaint = material("#ffad35");
  const tire = material("#1d2a38");
  const metal = material("#8fa9bd");
  const glass = material("#254761");
  const lamp = material("#ecfaff");

  function box(parent: Group, size: Dimensions, position: Point, surface: MeshLambertMaterial) {
    const mesh = new Mesh(boxGeometry, surface);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    parent.add(mesh);
    return mesh;
  }

  function wheel(parent: Group, diameter: number, width: number, x: number, y: number) {
    const mesh = new Mesh(wheelGeometry, tire);
    mesh.position.set(x, y, diameter / 2);
    mesh.scale.set(diameter, width, diameter);
    mesh.rotation.z = Math.PI / 2;
    parent.add(mesh);
  }

  // All models face local +Y, with Z pointing up from the road.
  const truck = new Group();
  box(truck, [2.5, 8.4, 0.45], [0, 0, 0.85], tire);
  box(truck, [2.45, 5.65, 2.65], [0, -1.22, 2.33], cargo);
  box(truck, [2.3, 2.1, 2.2], [0, 3.04, 2.02], truckPaint);
  box(truck, [1.94, 0.1, 0.7], [0, 4.1, 2.43], glass);
  for (const side of [-1, 1]) {
    for (const y of [-2.85, -1.6, 2.9]) wheel(truck, 1.03, 0.32, side * 1.18, y);
    box(truck, [0.4, 0.12, 0.21], [side * 0.82, 4.12, 1.32], lamp);
  }

  const car = new Group();
  box(car, [1.85, 4.45, 0.56], [0, 0, 0.55], carPaint);
  box(car, [1.45, 2.05, 0.52], [0, -0.2, 1.05], glass);
  box(car, [1.48, 1.45, 0.12], [0, -0.22, 1.34], carPaint);
  box(car, [1.72, 1.03, 0.18], [0, 1.58, 0.82], carPaint);
  for (const side of [-1, 1]) {
    for (const y of [-1.39, 1.42]) wheel(car, 0.64, 0.24, side * 0.88, y);
    box(car, [0.42, 0.08, 0.12], [side * 0.59, 2.25, 0.63], lamp);
  }

  const motorcycle = new Group();
  wheel(motorcycle, 0.66, 0.23, 0, 0.8);
  wheel(motorcycle, 0.68, 0.28, 0, -0.81);
  box(motorcycle, [0.44, 1.58, 0.23], [0, -0.08, 0.58], metal);
  box(motorcycle, [0.55, 0.8, 0.47], [0, 0.18, 0.85], bikePaint);
  box(motorcycle, [0.44, 0.76, 0.17], [0, -0.59, 0.91], tire);
  box(motorcycle, [0.16, 0.14, 0.76], [0, 0.7, 0.66], metal).rotation.x = -0.31;
  box(motorcycle, [0.8, 0.13, 0.1], [0, 0.47, 1.13], metal);
  box(motorcycle, [0.33, 0.23, 0.28], [0, 0.72, 0.98], lamp);

  const models: Record<VehicleCategory, Group> = { truck, car, motorcycle };
  return {
    models,
    dispose() {
      boxGeometry.dispose();
      wheelGeometry.dispose();
      for (const surface of [cargo, truckPaint, carPaint, bikePaint, tire, metal, glass, lamp]) surface.dispose();
    },
  };
}

export function createVehicleLayer(
  id: string,
  getVehicles: () => readonly MapVehicle[],
  onAvailabilityChange: (available: boolean) => void,
): CustomLayerInterface {
  const camera = new Camera();
  const scene = new Scene();
  const origin = MercatorCoordinate.fromLngLat(DEMO_CENTER);
  const originMatrix = new Matrix4().makeTranslation(origin.x, origin.y, 0);
  const models = new Map<string, Group>();
  const assets = createVehicleAssets();
  let renderer: WebGLRenderer | undefined;
  let map: MapLibreMap | undefined;

  const sun = new DirectionalLight(0xffffff, 2.15);
  sun.position.set(4, 5, 9);
  scene.add(new AmbientLight(0xffffff, 1.7), sun);

  return {
    id,
    type: "custom",
    renderingMode: "3d",
    onAdd(mapInstance, gl) {
      if (typeof WebGL2RenderingContext === "undefined" || !(gl instanceof WebGL2RenderingContext)) return;
      map = mapInstance;
      try {
        renderer = new WebGLRenderer({ canvas: mapInstance.getCanvas(), context: gl });
        renderer.autoClear = false;
      } catch {
        renderer = undefined;
      }
    },
    render(gl, options) {
      if (!renderer || !map || gl.isContextLost()) return;
      const vehicles = getVehicles().filter(hasVehicleModel);
      if (!vehicles.length) return;

      const visibleIds = new Set(vehicles.map(({ id }) => id));
      for (const [id, model] of models) {
        if (visibleIds.has(id)) continue;
        scene.remove(model);
        models.delete(id);
      }

      const worldPixels = 512 * 2 ** map.getZoom();
      for (const vehicle of vehicles) {
        let model = models.get(vehicle.id);
        if (!model) {
          model = assets.models[vehicle.category].clone();
          const bearing = new Group();
          bearing.add(model);
          scene.add(bearing);
          models.set(vehicle.id, bearing);
          model = bearing;
        }

        const coordinate = MercatorCoordinate.fromLngLat(vehicle.position);
        const { length, pixels } = sizes[vehicle.category];
        // These are map symbols, so even the smallest category stays visible at fleet zoom.
        const scale = Math.max(coordinate.meterInMercatorCoordinateUnits(), pixels / (worldPixels * length));
        model.position.set(coordinate.x - origin.x, coordinate.y - origin.y, 0);
        model.scale.set(scale, -scale, scale);
        model.children[0].rotation.z = -vehicle.heading * Math.PI / 180;
      }

      camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(originMatrix);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      renderer.resetState();
      renderer.render(scene, camera);
      onAvailabilityChange(true);
    },
    onRemove() {
      onAvailabilityChange(false);
      renderer?.dispose();
      assets.dispose();
    },
  };
}
