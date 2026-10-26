"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { holeWorld } from "@/lib/geometry";
import type { GuidePayload } from "@/lib/types";
import { calloutWorld } from "./BuildScene";

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
  if (!step?.callout || step.connections_added?.length === 0 && step.n === 1) {
    // still show seating close-up on early steps
  }
  const target =
    calloutWorld(step?.callout, payload) ??
    holeWorld("a4", payload.breadboard, 2);

  return (
    <div className="magnifier" aria-hidden>
      <Canvas camera={{ position: [8, 10, 8], fov: 28 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#f7f3ea"]} />
        <ambientLight intensity={1} />
        <directionalLight position={[6, 10, 4]} intensity={0.6} />
        <Closeup target={target} progress={progress} color="#43a047" />
      </Canvas>
    </div>
  );
}

function Closeup({
  target,
  progress,
  color,
}: {
  target: [number, number, number];
  progress: number;
  color: string;
}) {
  const tip = useRef<THREE.Group>(null);
  useFrame((state) => {
    state.camera.position.set(6, 8, 7);
    state.camera.lookAt(0, 1.2, 0);
    if (tip.current) {
      const t = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.2));
      const p = progress < 1 ? progress : t;
      tip.current.position.y = 8 - p * 6.4;
    }
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[6.2, 32]} />
        <meshToonMaterial color="#efe6d6" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.6, 16]} />
        <meshToonMaterial color="#1f1b16" />
      </mesh>
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 1.2, 8]} />
        <meshToonMaterial color="#d4af37" />
      </mesh>
      <group ref={tip} position={[0, 6, 0]}>
        <mesh>
          <cylinderGeometry args={[0.28, 0.28, 7, 10]} />
          <meshToonMaterial color={color} />
        </mesh>
        <mesh position={[0, -4, 0]}>
          <cylinderGeometry args={[0.12, 0.22, 1.4, 8]} />
          <meshToonMaterial color="#d4af37" />
        </mesh>
      </group>
      <mesh position={[2.6, 3.2, 0]} rotation={[0, 0, -0.7]}>
        <coneGeometry args={[0.7, 2.2, 10]} />
        <meshToonMaterial color="#1c1914" />
      </mesh>
      <mesh visible={false} position={target}>
        <boxGeometry args={[0.1, 0.1, 0.1]} />
      </mesh>
    </group>
  );
}
