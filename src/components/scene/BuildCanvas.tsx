"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { Suspense } from "react";
import type { GuidePayload } from "@/lib/types";
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
  const world = calloutWorld(step?.callout, payload);

  return (
    <Canvas
      camera={{ position: [-80, 140, -90], fov: 30, near: 0.1, far: 900 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#f4efe6"]} />
      <ambientLight intensity={1.05} />
      <directionalLight position={[70, 110, 40]} intensity={0.38} />
      <directionalLight position={[-50, 40, -30]} intensity={0.16} />
      <Suspense fallback={null}>
        <BuildScene
          payload={payload}
          stepIndex={stepIndex}
          progress={progress}
          preview={preview}
        />
        <ContactShadows
          position={[80, -8.8, 14]}
          opacity={0.12}
          scale={240}
          blur={2.8}
          far={50}
        />
      </Suspense>
      <CameraRig payload={payload} stepIndex={stepIndex} preview={preview} />
      {!preview && (
        <CalloutProjector world={world} onScreen={onCalloutScreen} />
      )}
    </Canvas>
  );
}
