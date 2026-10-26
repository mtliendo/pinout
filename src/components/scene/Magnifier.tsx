"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { holeWorld } from "@/lib/geometry";
import { labelForCallout } from "@/lib/callout";
import type { GuidePayload } from "@/lib/types";
import { BuildScene, calloutWorld } from "./BuildScene";

export function Magnifier({
  payload,
  stepIndex,
  progress,
}: {
  payload: GuidePayload;
  stepIndex: number;
  progress: number;
}) {
  const step = payload.build.steps[stepIndex];
  const target =
    calloutWorld(step?.callout, payload) ??
    holeWorld("a4", payload.breadboard, 2);
  const label = labelForCallout(step?.callout, payload);

  return (
    <div className="magnifier" aria-hidden>
      <Canvas camera={{ position: [10, 12, 10], fov: 24 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#f7f3ea"]} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[8, 14, 6]} intensity={0.4} />
        <group position={[-target[0], -target[1], -target[2]]}>
          <BuildScene
            payload={payload}
            stepIndex={stepIndex}
            progress={progress}
          />
        </group>
        <CloseupRig />
      </Canvas>
      {label ? <p className="magnifier-label">{label}</p> : null}
    </div>
  );
}

function CloseupRig() {
  useFrame((state) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    cam.position.set(9, 11, 8);
    cam.lookAt(0, 1.2, 0);
    cam.fov = 24;
    cam.updateProjectionMatrix();
  });
  return null;
}
