"use client";

import { Edges } from "@react-three/drei";
import * as THREE from "three";

export const INK = "#161410";
export const PALE = "#f6f1e8";
export const PALE_LINE = "#b7b0a4";

/** Flat, muted fills — IKEA manual, not toy-plastic primaries. */
export const FILLS = {
  board: "#efe8dc",
  pcb: "#5c6358",
  module: "#c8c4ba",
  header: "#2f2d2a",
  pin: "#c4a15a",
  usb: "#d5d2cb",
  usbSlot: "#2a2926",
  button: "#3a3834",
  antenna: "#6e7468",
  pirPcb: "#6d7d64",
  dome: "#f4f1ea",
  servo: "#5a7396",
  horn: "#efe6d6",
  led: "#b85a56",
  ledLeg: "#b0aaa0",
  resistor: "#d2c2a4",
  oledPcb: "#5a6480",
  oledGlass: "#2a2a28",
  jumper: "#d4c07a",
};

export function mute(hex: string, faded: boolean): string {
  if (!faded) return hex;
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(PALE), 0.88);
  return `#${c.getHexString()}`;
}

function hullPad(dims: number[]) {
  const m = Math.min(...dims.filter((n) => n > 0));
  return Math.min(1.7, Math.max(0.7, m * 0.1));
}

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
  const pad = hullPad(args);
  const fill = mute(color, Boolean(faded));
  const line = faded ? PALE_LINE : INK;
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <boxGeometry args={args} />
        <meshBasicMaterial color={fill} toneMapped={false} />
        <Edges threshold={18} color={line} lineWidth={faded ? 1.2 : 1.85} />
      </mesh>
      <mesh>
        <boxGeometry args={[l + pad, h + pad, w + pad]} />
        <meshBasicMaterial color={line} side={THREE.BackSide} toneMapped={false} />
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
  const [rTop, rBot, h, seg = 20] = args;
  const pad = hullPad([rTop * 2, rBot * 2, h]);
  const fill = mute(color, Boolean(faded));
  const line = faded ? PALE_LINE : INK;
  return (
    <group position={position} rotation={rotation}>
      <mesh>
        <cylinderGeometry args={[rTop, rBot, h, seg]} />
        <meshBasicMaterial color={fill} toneMapped={false} />
        <Edges threshold={22} color={line} lineWidth={faded ? 1.2 : 1.7} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[rTop + pad * 0.45, rBot + pad * 0.45, h + pad, seg]} />
        <meshBasicMaterial color={line} side={THREE.BackSide} toneMapped={false} />
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
  const fill = mute(color, Boolean(faded));
  const line = faded ? PALE_LINE : INK;
  const pad = Math.max(0.55, radius * 0.06);
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[radius, 22, 16]} />
        <meshBasicMaterial color={fill} toneMapped={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius + pad, 22, 16]} />
        <meshBasicMaterial color={line} side={THREE.BackSide} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function CelPin({
  args,
  faded,
  position,
}: {
  args: [number, number, number];
  faded?: boolean;
  position?: [number, number, number];
}) {
  const fill = mute(FILLS.pin, Boolean(faded));
  const line = faded ? PALE_LINE : INK;
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshBasicMaterial color={fill} toneMapped={false} />
      <Edges threshold={15} color={line} lineWidth={1.4} />
    </mesh>
  );
}
