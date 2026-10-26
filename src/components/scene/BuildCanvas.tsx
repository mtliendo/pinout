"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Suspense } from "react";
import type { GuidePayload } from "@/lib/types";
import { BuildScene, CameraRig } from "./BuildScene";

export function BuildCanvas({
  payload,
  stepIndex,
  progress,
  preview,
}: {
  payload: GuidePayload;
  stepIndex: number;
  progress: number;
  preview?: boolean;
}) {
  return (
    <Canvas
      camera={{ position: [-20, 160, -110], fov: 38, near: 0.1, far: 800 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
    >
      <color attach="background" args={["#f3eee4"]} />
      <ambientLight intensity={0.92} />
      <directionalLight position={[60, 90, 30]} intensity={0.55} />
      <directionalLight position={[-40, 40, -20]} intensity={0.22} />
      <Suspense fallback={null}>
        <BuildScene
          payload={payload}
          stepIndex={stepIndex}
          progress={progress}
          preview={preview}
        />
        <ContactShadows
          position={[80, -8.6, 14]}
          opacity={0.18}
          scale={220}
          blur={2.4}
          far={40}
        />
      </Suspense>
      <CameraRig payload={payload} stepIndex={stepIndex} preview={preview} />
      {preview ? null : (
        <OrbitControls
          enablePan={false}
          minDistance={40}
          maxDistance={220}
          maxPolarAngle={Math.PI / 2.05}
        />
      )}
    </Canvas>
  );
}
