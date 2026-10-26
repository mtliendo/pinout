"use client";

import { Outlines } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { dim, isApprox, type Component, type Placement } from "@/lib/specs/schema";
import { holeWorld, type Vec3 } from "@/lib/geometry";
import type { Breadboard } from "@/lib/specs/schema";

const PALE = "#efe8dc";
const INK = "#1c1914";

export function toon(color: string, faded: boolean): string {
  return faded ? PALE : color;
}

export function ToonMesh({
  children,
  color,
  faded,
  emissive,
}: {
  children: React.ReactNode;
  color: string;
  faded?: boolean;
  emissive?: string;
}) {
  return (
    <mesh castShadow={false} receiveShadow={false}>
      {children}
      <meshToonMaterial
        color={toon(color, Boolean(faded))}
        emissive={faded ? "#000000" : emissive ?? "#000000"}
        emissiveIntensity={faded ? 0 : 0.08}
      />
      <Outlines thickness={faded ? 1.1 : 1.6} color={faded ? "#c9c1b3" : INK} />
    </mesh>
  );
}

export function BreadboardModel({
  breadboard,
  faded,
}: {
  breadboard: Breadboard;
  faded?: boolean;
}) {
  const length = dim(breadboard.body?.length_mm, 165.1);
  const width = dim(breadboard.body?.width_mm, 54.6);
  const height = dim(breadboard.body?.height_mm, 8.5);
  const holes = useMemo(() => {
    const pts: Vec3[] = [];
    for (let row = 1; row <= breadboard.grid.rows; row++) {
      for (const col of breadboard.grid.columns) {
        const [x, , z] = holeWorld(`${col}${row}`, breadboard, 0);
        pts.push([x, 0, z]);
      }
    }
    return pts;
  }, [breadboard]);

  const cx = length / 2 - breadboard.grid.pitch / 2;
  const cz = 13.97;

  return (
    <group>
      <group position={[cx, -height / 2, cz]}>
        <ToonMesh color={(breadboard.colors?.body as string) ?? "#f3eee4"} faded={faded}>
          <boxGeometry args={[length + 10, height, width + 24]} />
        </ToonMesh>
      </group>
      {breadboard.rails.map((rail) => {
        const z = dim(rail.y_mm, 0);
        const color =
          rail.polarity === "positive"
            ? ((breadboard.colors?.rail_pos as string) ?? "#c23b2e")
            : ((breadboard.colors?.rail_neg as string) ?? "#1d4ed8");
        return (
          <mesh key={rail.id} position={[cx, 0.18, z]}>
            <boxGeometry args={[length - 4, 0.45, 2.2]} />
            <meshToonMaterial color={toon(color, Boolean(faded))} />
          </mesh>
        );
      })}
      <mesh position={[cx, 0.22, 13.97]}>
        <boxGeometry args={[length - 6, 1.4, 4.4]} />
        <meshToonMaterial color={toon("#e4ddd0", Boolean(faded))} />
      </mesh>
      {holes.map((p, i) => (
        <mesh key={i} position={[p[0], 0.28, p[2]]}>
          <cylinderGeometry args={[0.52, 0.52, 0.55, 8]} />
          <meshToonMaterial color={faded ? "#ddd4c6" : "#2a261f"} />
        </mesh>
      ))}
    </group>
  );
}

export function partWorld(
  placement: Placement,
  component: Component,
  breadboard: Breadboard,
): { position: Vec3; rotation: number } {
  if (placement.off_board) {
    const hint = placement.position_hint ?? "";
    if (hint.includes("left")) return { position: [-22, 10, 6], rotation: 0 };
    if (hint.includes("right")) return { position: [148, 10, 42], rotation: Math.PI };
    if (hint.includes("above")) return { position: [90, 18, -16], rotation: 0 };
    return { position: [80, 12, -20], rotation: 0 };
  }
  const firstHole =
    placement.pin_holes?.["J1.1"] ??
    placement.pin_holes?.["L.1"] ??
    placement.pin_holes?.["K"] ??
    placement.pin_holes?.["1"] ??
    placement.anchor_hole ??
    Object.values(placement.pin_holes ?? {})[0];
  if (!firstHole) return { position: [0, 8, 0], rotation: 0 };
  const pos = holeWorld(firstHole, breadboard, 1.2);
  return {
    position: pos,
    rotation: ((placement.rotation_deg ?? 0) * Math.PI) / 180,
  };
}

export function BoardModel({
  component,
  faded,
}: {
  component: Component;
  faded?: boolean;
}) {
  const length = dim(component.body?.length_mm, 62);
  const width = dim(component.body?.width_mm, 25.4);
  const ox = component.body?.outline_offset_from_pin1?.x ?? 0;
  const oy = component.body?.outline_offset_from_pin1?.y ?? 0;
  const xiao = component.id.startsWith("xiao-");
  const cx = ox + length / 2;
  const cz = oy + width / 2;
  const headerColor = (component.colors?.headers as string) ?? "#111111";
  return (
    <group>
      <group position={[cx, 0.9, cz]}>
        <ToonMesh color={(component.colors?.pcb as string) ?? "#1a1a1a"} faded={faded}>
          <boxGeometry args={[length, 1.6, width]} />
        </ToonMesh>
        <group position={[xiao ? -2 : 8, 2.4, 0]}>
          <ToonMesh
            color={(component.colors?.module_shield as string) ?? "#c4c4c4"}
            faded={faded}
          >
            <boxGeometry args={[xiao ? 12 : 25, 3.4, Math.max(10, width - 10)]} />
          </ToonMesh>
        </group>
        {!xiao && (
          <>
            <group position={[-length / 2 + 6, 1.7, 0]}>
              <ToonMesh color="#2b2b2b" faded={faded}>
                <boxGeometry args={[8, 0.6, width - 6]} />
              </ToonMesh>
            </group>
            <group position={[0, 1.4, -width / 2 + 1.1]}>
              <ToonMesh color={headerColor} faded={faded}>
                <boxGeometry args={[length - 4, 2.2, 2.2]} />
              </ToonMesh>
            </group>
            <group position={[0, 1.4, width / 2 - 1.1]}>
              <ToonMesh color={headerColor} faded={faded}>
                <boxGeometry args={[length - 4, 2.2, 2.2]} />
              </ToonMesh>
            </group>
          </>
        )}
        {component.features
          ?.filter((f) => f.kind === "usb")
          .map((f) => (
            <group
              key={f.id}
              position={[
                (f.position_mm?.x ?? length - 2) - cx,
                1.4,
                (f.position_mm?.y ?? 6) - cz,
              ]}
            >
              <ToonMesh color="#d5d8dc" faded={faded}>
                <boxGeometry args={[8.4, 3.4, 7.2]} />
              </ToonMesh>
            </group>
          ))}
        {component.features
          ?.filter((f) => f.kind === "button")
          .map((f) => (
            <group
              key={f.id}
              position={[
                (f.position_mm?.x ?? 0) - cx,
                2.2,
                (f.position_mm?.y ?? 0) - cz,
              ]}
            >
              <ToonMesh color="#2a2a2a" faded={faded}>
                <boxGeometry args={[3.2, 1.4, 3.2]} />
              </ToonMesh>
            </group>
          ))}
      </group>
      {(component.pins ?? []).map((pin) => (
        <mesh key={pin.id} position={[pin.position.x, -3.1, pin.position.y]}>
          <boxGeometry args={[0.62, 6.6, 0.62]} />
          <meshToonMaterial color={faded ? "#d9d1c4" : "#d4af37"} />
          <Outlines thickness={0.8} color={faded ? "#c9c1b3" : INK} />
        </mesh>
      ))}
    </group>
  );
}

export function CatalogPart({
  component,
  faded,
  active,
}: {
  component: Component;
  faded?: boolean;
  active?: boolean;
}) {
  if (component.kind === "board") {
    return <BoardModel component={component} faded={faded} />;
  }
  if (component.id === "hc-sr501-pir") {
    return (
      <group>
        <ToonMesh color="#1f6b2a" faded={faded}>
          <boxGeometry args={[32, 1.6, 24]} />
        </ToonMesh>
        <mesh position={[0, 7, 0]}>
          <sphereGeometry args={[9, 24, 16]} />
          <meshToonMaterial color={toon("#f4f4f0", Boolean(faded))} />
          <Outlines thickness={1.4} color={faded ? "#c9c1b3" : INK} />
        </mesh>
        {[-2.54, 0, 2.54].map((x) => (
          <mesh key={x} position={[x, -4, 10]}>
            <boxGeometry args={[0.6, 8, 0.6]} />
            <meshToonMaterial color="#d4af37" />
          </mesh>
        ))}
      </group>
    );
  }
  if (component.id === "sg90-servo") {
    return (
      <group>
        <ToonMesh color="#2f5fd0" faded={faded} emissive={active ? "#2f5fd0" : undefined}>
          <boxGeometry args={[23, 22, 12.2]} />
        </ToonMesh>
        <group position={[0, 2, 8]}>
          <ToonMesh color="#2f5fd0" faded={faded}>
            <boxGeometry args={[32, 2.2, 2.4]} />
          </ToonMesh>
        </group>
        <group position={[6, 13, 0]}>
          <ToonMesh color="#1b1b1b" faded={faded}>
            <cylinderGeometry args={[4.2, 4.2, 5, 16]} />
          </ToonMesh>
        </group>
        <mesh position={[11, 16.4, 0]}>
          <boxGeometry args={[18, 1.6, 5]} />
          <meshToonMaterial color={toon("#efefe8", Boolean(faded))} />
          <Outlines thickness={1.2} color={INK} />
        </mesh>
      </group>
    );
  }
  if (component.id === "led-5mm-red") {
    return (
      <group>
        <mesh position={[1.27, 6, 0]}>
          <sphereGeometry args={[2.5, 16, 12]} />
          <meshToonMaterial
            color={toon("#e02020", Boolean(faded))}
            emissive={faded ? "#000" : "#e02020"}
            emissiveIntensity={active ? 0.45 : 0.12}
          />
          <Outlines thickness={1.2} color={INK} />
        </mesh>
        <mesh position={[0, 1, 0]}>
          <boxGeometry args={[0.4, 8, 0.4]} />
          <meshToonMaterial color="#c0c0c0" />
        </mesh>
        <mesh position={[2.54, 0.4, 0]}>
          <boxGeometry args={[0.4, 6.8, 0.4]} />
          <meshToonMaterial color="#c0c0c0" />
        </mesh>
      </group>
    );
  }
  if (component.id === "resistor-220") {
    return (
      <group rotation={[0, 0, Math.PI / 2]}>
        <ToonMesh color="#d8c49a" faded={faded}>
          <cylinderGeometry args={[1.2, 1.2, 6.3, 12]} />
        </ToonMesh>
        {[-1.6, -0.4, 0.8].map((y, i) => (
          <mesh key={i} position={[0, y, 0]}>
            <torusGeometry args={[1.22, 0.18, 6, 12]} />
            <meshToonMaterial color={["#c0392b", "#c0392b", "#6d4c41"][i]} />
          </mesh>
        ))}
      </group>
    );
  }
  if (component.id === "tactile-button-6mm") {
    return (
      <group>
        <ToonMesh color="#1a1a1a" faded={faded}>
          <boxGeometry args={[6, 3.2, 6]} />
        </ToonMesh>
        <ToonMesh color="#2a2a2a" faded={faded}>
          <cylinderGeometry args={[1.6, 1.6, 2.2, 12]} />
        </ToonMesh>
      </group>
    );
  }
  if (component.id === "ssd1306-oled-128x64-i2c") {
    return (
      <group>
        <ToonMesh color="#1b3fa0" faded={faded}>
          <boxGeometry args={[27, 1.6, 27]} />
        </ToonMesh>
        <ToonMesh color="#111111" faded={faded} emissive={active ? "#2a6cff" : undefined}>
          <boxGeometry args={[22, 1, 12]} />
        </ToonMesh>
      </group>
    );
  }
  return (
    <ToonMesh color="#c4b8a4" faded={faded}>
      <boxGeometry args={[8, 4, 8]} />
    </ToonMesh>
  );
}

export function GrowingWire({
  points,
  color,
  progress,
  faded,
}: {
  points: Vec3[];
  color: string;
  progress: number;
  faded?: boolean;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        points.map((p) => new THREE.Vector3(...p)),
        false,
        "catmullrom",
        0.15,
      ),
    [points],
  );
  const t = Math.max(0.02, Math.min(1, progress));
  const geometry = useMemo(() => {
    const slice = curve.getPoints(Math.max(6, Math.floor(48 * t)));
    const sub = new THREE.CatmullRomCurve3(slice);
    return new THREE.TubeGeometry(sub, slice.length, faded ? 0.46 : 0.72, 10, false);
  }, [curve, t, faded]);
  return (
    <mesh geometry={geometry}>
      <meshToonMaterial color={faded ? "#d7cfc2" : color} />
      <Outlines thickness={0.9} color={faded ? "#c9c1b3" : INK} />
    </mesh>
  );
}

export function GuideArrow({
  from,
  to,
  active,
}: {
  from: Vec3;
  to: Vec3;
  active: boolean;
}) {
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length() || 1;
  dir.normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir,
  );
  return (
    <group position={from} quaternion={quat}>
      <mesh position={[0, len * 0.45, 0]}>
        <cylinderGeometry args={[0.18, 0.18, len * 0.7, 8]} />
        <meshToonMaterial color={active ? INK : "#c9c1b3"} />
      </mesh>
      <mesh position={[0, len * 0.88, 0]}>
        <coneGeometry args={[1.1, 3.2, 10]} />
        <meshToonMaterial color={active ? INK : "#c9c1b3"} />
        <Outlines thickness={1} color={INK} />
      </mesh>
    </group>
  );
}

export { isApprox };
