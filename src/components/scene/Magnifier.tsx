"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { holeWorld, parseHole } from "@/lib/geometry";
import { labelForCallout } from "@/lib/callout";
import type { GuidePayload } from "@/lib/types";
import { BuildScene, calloutWorld } from "./BuildScene";

function magnifierWorld(callout: string | undefined, payload: GuidePayload) {
  if (callout) {
    const parsed = parseHole(callout);
    if (parsed?.kind === "hole") {
      return holeWorld(callout, payload.breadboard, 1.15);
    }
  }
  return (
    calloutWorld(callout, payload) ?? holeWorld("a4", payload.breadboard, 1.15)
  );
}

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
  const callout = step?.callout;
  const target = magnifierWorld(callout, payload);
  const label = labelForCallout(callout, payload);

  return (
    <div className="magnifier" aria-hidden>
      <Canvas
        orthographic
        camera={{ position: [8, 14, 8], zoom: 1, near: -200, far: 200 }}
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
        <CloseupRig callout={callout} />
      </Canvas>
      <span className="magnifier-arrow" />
      {label && progress > 0.18 ? (
        <p className="magnifier-label">{label}</p>
      ) : null}
    </div>
  );
}

function CloseupRig({ callout }: { callout?: string }) {
  useFrame((state) => {
    const cam = state.camera as THREE.OrthographicCamera;
    const pinSeat = callout === "b1" || callout === "usb_uart";
    if (pinSeat) {
      cam.position.set(-4.2, 6.2, 1.4);
      cam.lookAt(0, 1.35, 0);
    } else {
      cam.position.set(-5, 15, -11);
      cam.lookAt(0, 0.5, 0);
    }
    const zoomIn = pinSeat ? 7.6 : 14;
    const half = zoomIn / 2;
    const aspect = state.size.width / Math.max(1, state.size.height);
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
