"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import type { GuidePayload } from "@/lib/types";
import { stepFocus } from "@/lib/callout";
import { calloutWorld, BuildScene, CameraRig, CalloutProjector } from "./BuildScene";

export function BuildCanvas({
  payload,
  stepIndex,
  progress,
  preview,
  onCalloutScreen,
}: {
  payload: GuidePayload;
  stepIndex: number;
  progress: number;
  preview?: boolean;
  onCalloutScreen?: (xy: { x: number; y: number } | null) => void;
}) {
  const step = payload.build.steps[Math.min(stepIndex, payload.build.steps.length - 1)];
  const world = calloutWorld(stepFocus(step, payload), payload);

  return (
    <Canvas
      orthographic
      camera={{ position: [-120, 140, -120], zoom: 1, near: -900, far: 900 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#f4efe6"]} />
      <Suspense fallback={null}>
        <BuildScene
          payload={payload}
          stepIndex={stepIndex}
          progress={progress}
          preview={preview}
        />
      </Suspense>
      <CameraRig payload={payload} stepIndex={stepIndex} preview={preview} />
      {!preview && (
        <CalloutProjector world={world} onScreen={onCalloutScreen} />
      )}
    </Canvas>
  );
}
