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
      <Canvas
        orthographic
        camera={{ position: [12, 16, 12], zoom: 1, near: -200, far: 200 }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={["#f7f3ea"]} />
        <group position={[-target[0], -target[1], -target[2]]}>
          <BuildScene
            payload={payload}
            stepIndex={stepIndex}
            progress={progress}
          />
        </group>
        <CloseupRig progress={progress} />
      </Canvas>
      <span className="magnifier-arrow" />
      {label ? <p className="magnifier-label">{label}</p> : null}
    </div>
  );
}

function CloseupRig({ progress }: { progress: number }) {
  useFrame((state) => {
    const cam = state.camera as THREE.OrthographicCamera;
    const zoomIn = 18 - progress * 2.5;
    const half = zoomIn / 2;
    const aspect = state.size.width / Math.max(1, state.size.height);
    cam.position.set(9, 14, 9);
    cam.lookAt(0, 1.2, 0);
    cam.left = -half * aspect;
    cam.right = half * aspect;
    cam.top = half;
    cam.bottom = -half;
    cam.near = -200;
    cam.far = 200;
    cam.zoom = 1;
    cam.updateProjectionMatrix();
  });
  return null;
}
