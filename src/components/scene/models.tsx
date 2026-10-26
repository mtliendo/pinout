"use client";

import { Edges } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { dim, isApprox, type Component, type Placement } from "@/lib/specs/schema";
import { holeWorld, type Vec3 } from "@/lib/geometry";
import type { Breadboard } from "@/lib/specs/schema";
import {
  CelBox,
  CelCyl,
  CelPin,
  CelSphere,
  FILLS,
  INK,
  PALE,
  PALE_LINE,
  mute,
} from "./cel";

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
  const pitch = breadboard.grid.pitch;
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

  const colZ = Object.values(breadboard.grid.column_y_mm);
  const railZ = breadboard.rails.map((r) => dim(r.y_mm, 0));
  const midZ = ([...colZ, ...railZ].reduce((a, b) => a + b, 0) / (colZ.length + railZ.length)) || 14;
  const holeSpan = (breadboard.grid.rows - 1) * pitch;
  const cx = holeSpan / 2;
  const inst = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!inst.current) return;
    const dummy = new THREE.Object3D();
    holes.forEach((p, i) => {
      dummy.position.set(p[0], 0.18, p[2]);
      dummy.updateMatrix();
      inst.current!.setMatrixAt(i, dummy.matrix);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  }, [holes]);

  const trenchZ =
    ((breadboard.grid.column_y_mm.e ?? 10.16) + (breadboard.grid.column_y_mm.f ?? 17.78)) / 2;

  return (
    <group>
      <CelBox
        args={[length, height, width]}
        color={FILLS.board}
        faded={faded}
        position={[cx, -height / 2, midZ]}
      />
      <CelBox
        args={[length - 10, 0.55, 3.6]}
        color="#e4ddd0"
        faded={faded}
        position={[cx, 0.12, trenchZ]}
      />
      {breadboard.rails.map((rail) => {
        const z = dim(rail.y_mm, 0);
        const color = rail.polarity === "positive" ? "#b24a44" : "#3f6494";
        return (
          <CelBox
            key={rail.id}
            args={[length - 14, 0.22, 0.42]}
            color={color}
            faded={faded}
            position={[cx, 0.2, z]}
          />
        );
      })}
      <instancedMesh ref={inst} args={[undefined, undefined, holes.length]}>
        <cylinderGeometry args={[0.38, 0.38, 0.3, 8]} />
        <meshBasicMaterial color={faded ? "#ddd6ca" : "#7a746a"} toneMapped={false} />
      </instancedMesh>
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
    if (hint.includes("left")) return { position: [-40, 1.4, 14], rotation: Math.PI / 2 };
    if (hint.includes("right")) return { position: [lengthHint(breadboard) + 26, 0, 16], rotation: 0 };
    if (hint.includes("above")) return { position: [90, 16, -18], rotation: 0 };
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

function lengthHint(breadboard: Breadboard) {
  return dim(breadboard.body?.length_mm, 165);
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
  return (
    <group>
      <group position={[cx, 0.9, cz]}>
        <CelBox args={[length, 1.6, width]} color={FILLS.pcb} faded={faded} />
        <CelBox
          args={[xiao ? 12.5 : 25.2, 3.1, xiao ? 10.5 : 17.6]}
          color={FILLS.module}
          faded={faded}
          position={[xiao ? -1 : -8.4, 2.35, 0]}
        />
        {!xiao && (
          <>
            <CelBox
              args={[7.2, 0.45, width - 6]}
              color={FILLS.antenna}
              faded={faded}
              position={[-length / 2 + 4.8, 1.05, 0]}
            />
            <CelBox
              args={[5.2, 0.2, 3.4]}
              color="#8a9084"
              faded={faded}
              position={[-length / 2 + 3.6, 1.22, 0]}
            />
            <CelBox
              args={[length - 8, 2.3, 2.2]}
              color={FILLS.header}
              faded={faded}
              position={[0, 1.5, -width / 2 + 1.2]}
            />
            <CelBox
              args={[length - 8, 2.3, 2.2]}
              color={FILLS.header}
              faded={faded}
              position={[0, 1.5, width / 2 - 1.2]}
            />
            <CelCyl
              args={[0.7, 0.7, 0.6, 10]}
              color="#7a4a88"
              faded={faded}
              position={[1.2, 1.15, -3.2]}
            />
          </>
        )}
        {component.features
          ?.filter((f) => f.kind === "usb")
          .map((f) => (
            <UsbC
              key={f.id}
              faded={faded}
              position={[
                (f.position_mm?.x ?? length - 2) - cx + 2.6,
                1.4,
                (f.position_mm?.y ?? 6) - cz,
              ]}
            />
          ))}
        {component.features
          ?.filter((f) => f.kind === "button")
          .map((f) => (
            <group
              key={f.id}
              position={[
                (f.position_mm?.x ?? 0) - cx,
                1.7,
                (f.position_mm?.y ?? 0) - cz,
              ]}
            >
              <CelBox args={[3.6, 1.15, 3.6]} color={FILLS.button} faded={faded} />
              <CelCyl
                args={[0.95, 0.95, 1.05, 10]}
                color="#4a4946"
                faded={faded}
                position={[0, 0.75, 0]}
              />
            </group>
          ))}
      </group>
      {(component.pins ?? []).map((pin) => (
        <CelPin
          key={pin.id}
          args={[0.64, 8.6, 0.64]}
          faded={faded}
          position={[pin.position.x, -2.7, pin.position.y]}
        />
      ))}
    </group>
  );
}

function UsbC({
  faded,
  position,
}: {
  faded?: boolean;
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      <CelBox args={[8.4, 3.05, 7.3]} color={FILLS.usb} faded={faded} />
      <CelBox
        args={[2.6, 1.15, 5.1]}
        color={FILLS.usbSlot}
        faded={faded}
        position={[3.4, 0, 0]}
      />
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
  void active;
  if (component.kind === "board") {
    return <BoardModel component={component} faded={faded} />;
  }
  if (component.id === "hc-sr501-pir") {
    return (
      <group>
        <CelBox args={[32, 1.6, 24]} color={FILLS.pirPcb} faded={faded} />
        <CelCyl
          args={[10.2, 10.2, 2.2, 20]}
          color="#e8e4da"
          faded={faded}
          position={[0, 2.2, 0]}
        />
        <CelSphere radius={10} color={FILLS.dome} faded={faded} position={[0, 7.6, 0]} />
        <CelCyl
          args={[1.45, 1.45, 1.15, 10]}
          color="#8a7a4a"
          faded={faded}
          position={[-8, 1.4, -7]}
        />
        <CelCyl
          args={[1.45, 1.45, 1.15, 10]}
          color="#8a7a4a"
          faded={faded}
          position={[8, 1.4, -7]}
        />
        {[-2.54, 0, 2.54].map((x) => (
          <CelPin key={x} args={[0.58, 8.2, 0.58]} faded={faded} position={[x, -4.2, 11]} />
        ))}
      </group>
    );
  }
  if (component.id === "sg90-servo") {
    return (
      <group>
        <CelBox args={[22.5, 21, 12.2]} color={FILLS.servo} faded={faded} position={[0, 10.5, 0]} />
        <CelBox
          args={[32.4, 2.2, 11.6]}
          color={FILLS.servo}
          faded={faded}
          position={[0, 19.2, 0]}
        />
        <CelCyl
          args={[0.9, 0.9, 2.4, 10]}
          color={FILLS.pcb}
          faded={faded}
          position={[-13.4, 19.2, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <CelCyl
          args={[0.9, 0.9, 2.4, 10]}
          color={FILLS.pcb}
          faded={faded}
          position={[13.4, 19.2, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <CelCyl
          args={[5.7, 5.7, 4.6, 18]}
          color="#2c2b28"
          faded={faded}
          position={[5.6, 23.4, 0]}
        />
        <CelCyl
          args={[2.1, 2.1, 2.2, 12]}
          color={FILLS.horn}
          faded={faded}
          position={[5.6, 26.6, 0]}
        />
        <CelBox
          args={[16.5, 1.4, 5.2]}
          color={FILLS.horn}
          faded={faded}
          position={[11.2, 27.4, 0]}
        />
        <CelBox
          args={[5.2, 1.6, 2.4]}
          color="#c47a3a"
          faded={faded}
          position={[-8.4, 2.2, 0]}
        />
      </group>
    );
  }
  if (component.id === "led-5mm-red") {
    return (
      <group>
        <CelCyl
          args={[2.5, 2.5, 2.8, 16]}
          color={FILLS.led}
          faded={faded}
          position={[1.27, 3.8, 0]}
        />
        <CelSphere radius={2.55} color={FILLS.led} faded={faded} position={[1.27, 5.6, 0]} />
        <CelPin args={[0.4, 8.2, 0.4]} faded={faded} position={[0, 0.4, 0]} />
        <CelPin args={[0.4, 6.8, 0.4]} faded={faded} position={[2.54, 0.1, 0]} />
      </group>
    );
  }
  if (component.id === "resistor-220") {
    return (
      <group rotation={[0, 0, Math.PI / 2]}>
        <CelCyl args={[1.15, 1.15, 6.3, 12]} color={FILLS.resistor} faded={faded} />
        {[-1.6, 0.8].map((y, i) => (
          <mesh key={i} position={[0, y, 0]}>
            <torusGeometry args={[1.18, 0.16, 6, 12]} />
            <meshBasicMaterial
              color={mute(i === 0 ? "#a34a44" : "#6a5344", Boolean(faded))}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    );
  }
  if (component.id === "tactile-button-6mm") {
    return (
      <group>
        <CelBox args={[6, 3.1, 6]} color={FILLS.button} faded={faded} />
        <CelCyl args={[1.55, 1.55, 2.1, 12]} color="#3a3936" faded={faded} position={[0, 2, 0]} />
      </group>
    );
  }
  if (component.id === "ssd1306-oled-128x64-i2c") {
    return (
      <group>
        <CelBox args={[27.5, 1.5, 27.5]} color={FILLS.oledPcb} faded={faded} />
        <CelBox
          args={[21.5, 1.1, 11.5]}
          color={FILLS.oledGlass}
          faded={faded}
          position={[0, 1.1, 1]}
        />
      </group>
    );
  }
  return <CelBox args={[8, 4, 8]} color="#c4b8a4" faded={faded} />;
}

function muteWire(color: string, faded?: boolean) {
  if (faded) return mute(color, true);
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color("#c4b8a4"), 0.36);
  return `#${c.getHexString()}`;
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
        0.28,
      ),
    [points],
  );
  const t = Math.max(0.04, Math.min(1, progress));
  const geometry = useMemo(() => {
    const slice = curve.getPoints(Math.max(8, Math.floor(56 * t)));
    const sub = new THREE.CatmullRomCurve3(slice);
    return new THREE.TubeGeometry(sub, slice.length, faded ? 0.36 : 0.48, 8, false);
  }, [curve, t, faded]);
  const hull = useMemo(() => {
    const slice = curve.getPoints(Math.max(8, Math.floor(56 * t)));
    const sub = new THREE.CatmullRomCurve3(slice);
    return new THREE.TubeGeometry(sub, slice.length, faded ? 0.52 : 0.72, 8, false);
  }, [curve, t, faded]);

  const start = curve.getPoint(0);
  const startT = curve.getTangent(0);
  const end = curve.getPoint(t);
  const endT = curve.getTangent(t);
  const startQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    startT.clone().normalize(),
  );
  const endQ = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    endT.clone().normalize(),
  );
  const body = muteWire(color, faded);
  const housing = faded ? mute(FILLS.jumper, true) : FILLS.jumper;
  const line = faded ? PALE_LINE : INK;

  return (
    <group>
      <mesh geometry={hull}>
        <meshBasicMaterial color={line} side={THREE.BackSide} toneMapped={false} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={body} toneMapped={false} />
      </mesh>
      <Dupont position={start.toArray() as Vec3} quaternion={startQ} color={housing} faded={faded} />
      <Dupont position={end.toArray() as Vec3} quaternion={endQ} color={housing} faded={faded} />
    </group>
  );
}

function Dupont({
  position,
  quaternion,
  color,
  faded,
}: {
  position: Vec3;
  quaternion: THREE.Quaternion;
  color: string;
  faded?: boolean;
}) {
  return (
    <group position={position} quaternion={quaternion}>
      <CelBox args={[2.35, 6.4, 2.35]} color={color} faded={faded} />
      <CelPin args={[0.7, 2.4, 0.7]} faded={faded} position={[0, -4.2, 0]} />
    </group>
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
  const group = useRef<THREE.Group>(null);
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const len = dir.length() || 1;
  dir.normalize();
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir,
  );
  useFrame((state) => {
    if (!group.current) return;
    const bob = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.1;
    group.current.scale.setScalar(bob);
    group.current.position.y = from[1] + Math.sin(state.clock.elapsedTime * 6) * 1.6;
  });
  return (
    <group ref={group} position={from} quaternion={quat}>
      <CelCyl
        args={[0.28, 0.28, len * 0.58, 8]}
        color={active ? INK : PALE_LINE}
        position={[0, len * 0.36, 0]}
      />
      <mesh position={[0, len * 0.78, 0]}>
        <coneGeometry args={[1.35, 3.6, 10]} />
        <meshBasicMaterial color={active ? INK : PALE_LINE} toneMapped={false} />
        <Edges threshold={20} color={INK} lineWidth={1.6} />
      </mesh>
    </group>
  );
}

export { isApprox, PALE, INK };
