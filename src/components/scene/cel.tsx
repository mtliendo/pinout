"use client";

import { Outlines } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

export const INK = "#161410";
export const PALE = "#f4efe6";
export const PALE_LINE = "#c8c0b4";

/** Flat, muted fills — IKEA manual, not toy-plastic primaries. */
export const FILLS = {
  board: "#e8e2d6",
  pcb: "#3f403c",
  module: "#b7b3aa",
  header: "#2a2926",
  pin: "#c4a15a",
  usb: "#c8cbc8",
  button: "#2f2e2b",
  antenna: "#2c2c2a",
  pirPcb: "#5b6d55",
  dome: "#f6f4ee",
  servo: "#4d6a9a",
  horn: "#efe8dc",
  led: "#c45c56",
  ledLeg: "#b0aaa0",
  resistor: "#d2c2a4",
  oledPcb: "#3d4d7a",
  oledGlass: "#1c1c1c",
  jumper: "#d8c37a",
};

let ramp: THREE.DataTexture | null = null;

export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  const data = new Uint8Array([
    96, 96, 92, 255, 168, 166, 158, 255, 228, 224, 214, 255,
  ]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  ramp = tex;
  return tex;
}

export function mute(hex: string, faded: boolean): string {
  if (faded) return PALE;
  return hex;
}

export function CelMesh({
  color,
  faded,
  children,
  screenspace = 2.2,
}: {
  color: string;
  faded?: boolean;
  children: React.ReactNode;
  screenspace?: number;
}) {
  const fill = faded ? PALE : color;
  const line = faded ? PALE_LINE : INK;
  const gradientMap = useMemo(() => toonRamp(), []);
  return (
    <mesh>
      {children}
      <meshToonMaterial color={fill} gradientMap={gradientMap} />
      <Outlines
        screenspace
        thickness={faded ? 1.5 : screenspace}
        color={line}
        angle={Math.PI}
        opacity={1}
        transparent={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Inverted-hull box — crisp silhouette at any distance. */
export function CelBox({
  args,
  color,
  faded,
  position,
  rotation,
}: {
  args: [number, number, number];
  color: string;
  faded?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const [l, h, w] = args;
  const pad = 0.7;
  const fill = faded ? PALE : color;
  const line = faded ? PALE_LINE : INK;
  const gradientMap = useMemo(() => toonRamp(), []);
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={args} />
        <meshToonMaterial color={fill} gradientMap={gradientMap} />
      </mesh>
      <mesh>
        <boxGeometry args={[l + pad, h + pad, w + pad]} />
        <meshBasicMaterial color={line} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

export function CelCyl({
  args,
  color,
  faded,
  position,
  rotation,
}: {
  args: [number, number, number, number?];
  color: string;
  faded?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  const [rTop, rBot, h, seg = 16] = args;
  const fill = faded ? PALE : color;
  const line = faded ? PALE_LINE : INK;
  const gradientMap = useMemo(() => toonRamp(), []);
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[rTop, rBot, h, seg]} />
        <meshToonMaterial color={fill} gradientMap={gradientMap} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[rTop + 0.35, rBot + 0.35, h + 0.5, seg]} />
        <meshBasicMaterial color={line} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

export function CelSphere({
  radius,
  color,
  faded,
  position,
}: {
  radius: number;
  color: string;
  faded?: boolean;
  position?: [number, number, number];
}) {
  const fill = faded ? PALE : color;
  const line = faded ? PALE_LINE : INK;
  const gradientMap = useMemo(() => toonRamp(), []);
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[radius, 20, 14]} />
        <meshToonMaterial color={fill} gradientMap={gradientMap} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius + 0.4, 20, 14]} />
        <meshBasicMaterial color={line} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}
