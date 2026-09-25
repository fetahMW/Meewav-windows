import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const LANDMARK_DRACO_DECODER_PATH = "/vendor/draco/";

export function createLandmarkGltfLoader() {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(LANDMARK_DRACO_DECODER_PATH);
  dracoLoader.preload();

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  return {
    gltfLoader,
    dispose() {
      dracoLoader.dispose();
    },
  };
}
