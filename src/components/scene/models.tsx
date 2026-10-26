"use client";

import { Outlines } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { dim, isApprox, type Component, type Placement } from "@/lib/specs/schema";
import { holeWorld, type Vec3 } from "@/lib/geometry";
import type { Breadboard } from "@/lib/specs/schema";
import {
  CelBox,
  CelCyl,
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
  const bodyZ = 13.97;
  const bodyW = width + 22;
  const inst = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    if (!inst.current) return;
    const dummy = new THREE.Object3D();
    holes.forEach((p, i) => {
      dummy.position.set(p[0], 0.16, p[2]);
      dummy.updateMatrix();
      inst.current!.setMatrixAt(i, dummy.matrix);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  }, [holes]);

  return (
    <group>
      <CelBox
        args={[length + 8, height, bodyW]}
        color={FILLS.board}
        faded={faded}
        position={[cx, -height / 2, bodyZ]}
      />
      <CelBox
        args={[length - 8, 0.9, 4.2]}
        color="#ddd6c8"
        faded={faded}
        position={[cx, 0.1, bodyZ]}
      />
      {breadboard.rails.map((rail) => {
        const z = dim(rail.y_mm, 0);
        const color =
          rail.polarity === "positive" ? "#b24a44" : "#3f6494";
        return (
          <CelBox
            key={rail.id}
            args={[length - 10, 0.28, 0.7]}
            color={color}
            faded={faded}
            position={[cx, 0.22, z]}
          />
        );
      })}
      <instancedMesh ref={inst} args={[undefined, undefined, holes.length]}>
        <cylinderGeometry args={[0.3, 0.3, 0.28, 8]} />
        <meshToonMaterial color={faded ? "#ddd6ca" : "#5a544c"} />
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
    if (hint.includes("left")) return { position: [-28, 9, 8], rotation: 0 };
    if (hint.includes("right")) return { position: [lengthHint(breadboard) + 8, 11, 40], rotation: Math.PI };
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
          args={[xiao ? 13 : 25, 3.2, Math.max(11, width - 9)]}
          color={FILLS.module}
          faded={faded}
          position={[xiao ? -2 : 6, 2.5, 0]}
        />
        {!xiao && (
          <>
            <CelBox
              args={[7.5, 0.5, width - 7]}
              color={FILLS.antenna}
              faded={faded}
              position={[-length / 2 + 5.5, 1.2, 0]}
            />
            <CelBox
              args={[length - 6, 2.1, 2.1]}
              color={FILLS.header}
              faded={faded}
              position={[0, 1.3, -width / 2 + 1.15]}
            />
            <CelBox
              args={[length - 6, 2.1, 2.1]}
              color={FILLS.header}
              faded={faded}
              position={[0, 1.3, width / 2 - 1.15]}
            />
          </>
        )}
        {component.features
          ?.filter((f) => f.kind === "usb")
          .map((f) => (
            <CelBox
              key={f.id}
              args={[8.6, 3.1, 7.4]}
              color={FILLS.usb}
              faded={faded}
              position={[
                (f.position_mm?.x ?? length - 2) - cx,
                1.5,
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
                2.1,
                (f.position_mm?.y ?? 0) - cz,
              ]}
            >
              <CelBox args={[3.4, 1.2, 3.4]} color={FILLS.button} faded={faded} />
              <CelCyl args={[0.9, 0.9, 1.1, 10]} color="#4a4946" faded={faded} position={[0, 0.8, 0]} />
            </group>
          ))}
      </group>
      {(component.pins ?? []).map((pin) => (
        <mesh key={pin.id} position={[pin.position.x, -3.15, pin.position.y]}>
          <boxGeometry args={[0.58, 6.8, 0.58]} />
          <meshToonMaterial color={mute(FILLS.pin, Boolean(faded))} />
          <Outlines
            screenspace
            thickness={1.4}
            color={faded ? PALE_LINE : INK}
            angle={Math.PI}
          />
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
  void active;
  if (component.kind === "board") {
    return <BoardModel component={component} faded={faded} />;
  }
  if (component.id === "hc-sr501-pir") {
    return (
      <group>
        <CelBox args={[32, 1.6, 24]} color={FILLS.pirPcb} faded={faded} />
        <CelCyl
          args={[1.4, 1.4, 1.2, 10]}
          color="#8a7a4a"
          faded={faded}
          position={[-8, 1.4, -6]}
        />
        <CelCyl
          args={[1.4, 1.4, 1.2, 10]}
          color="#8a7a4a"
          faded={faded}
          position={[8, 1.4, -6]}
        />
        <CelSphere radius={8.4} color={FILLS.dome} faded={faded} position={[0, 7.2, 1]} />
        {[-2.54, 0, 2.54].map((x) => (
          <mesh key={x} position={[x, -4, 11]}>
            <boxGeometry args={[0.55, 8, 0.55]} />
            <meshToonMaterial color={mute(FILLS.pin, Boolean(faded))} />
            <Outlines screenspace thickness={1.3} color={faded ? PALE_LINE : INK} angle={Math.PI} />
          </mesh>
        ))}
      </group>
    );
  }
  if (component.id === "sg90-servo") {
    return (
      <group>
        <CelBox args={[22.5, 21, 12.2]} color={FILLS.servo} faded={faded} />
        <CelBox
          args={[32, 2.1, 2.2]}
          color={FILLS.servo}
          faded={faded}
          position={[0, 1.5, 0]}
        />
        <CelCyl
          args={[3.8, 3.8, 4.4, 16]}
          color="#2c2b28"
          faded={faded}
          position={[6.2, 12.8, 0]}
        />
        <CelBox
          args={[17, 1.5, 5]}
          color={FILLS.horn}
          faded={faded}
          position={[11, 15.6, 0]}
        />
        <CelBox
          args={[4, 1.2, 1.2]}
          color="#c47a3a"
          faded={faded}
          position={[-8, -8, 0]}
        />
      </group>
    );
  }
  if (component.id === "led-5mm-red") {
    return (
      <group>
        <CelCyl
          args={[2.4, 2.4, 2.6, 14]}
          color={FILLS.led}
          faded={faded}
          position={[1.27, 3.6, 0]}
        />
        <CelSphere radius={2.45} color={FILLS.led} faded={faded} position={[1.27, 5.4, 0]} />
        <mesh position={[0, 0.6, 0]}>
          <boxGeometry args={[0.38, 7.2, 0.38]} />
          <meshToonMaterial color={mute(FILLS.ledLeg, Boolean(faded))} />
          <Outlines screenspace thickness={1.2} color={faded ? PALE_LINE : INK} angle={Math.PI} />
        </mesh>
        <mesh position={[2.54, 0.2, 0]}>
          <boxGeometry args={[0.38, 6.4, 0.38]} />
          <meshToonMaterial color={mute(FILLS.ledLeg, Boolean(faded))} />
          <Outlines screenspace thickness={1.2} color={faded ? PALE_LINE : INK} angle={Math.PI} />
        </mesh>
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
            <meshToonMaterial color={mute(i === 0 ? "#a34a44" : "#6a5344", Boolean(faded))} />
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
  return (
    <CelBox args={[8, 4, 8]} color="#c4b8a4" faded={faded} />
  );
}

function muteWire(color: string, faded?: boolean) {
  if (faded) return PALE;
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color("#c4b8a4"), 0.28);
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
        0.22,
      ),
    [points],
  );
  const t = Math.max(0.04, Math.min(1, progress));
  const geometry = useMemo(() => {
    const slice = curve.getPoints(Math.max(8, Math.floor(56 * t)));
    const sub = new THREE.CatmullRomCurve3(slice);
    return new THREE.TubeGeometry(sub, slice.length, faded ? 0.38 : 0.52, 8, false);
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
  const housing = faded ? PALE : FILLS.jumper;

  return (
    <group>
      <mesh geometry={geometry}>
        <meshToonMaterial color={body} />
        <Outlines
          screenspace
          thickness={faded ? 1.2 : 1.8}
          color={faded ? PALE_LINE : INK}
          angle={Math.PI}
        />
      </mesh>
      <group position={start.toArray()} quaternion={startQ}>
        <CelBox args={[1.5, 3.1, 1.5]} color={housing} faded={faded} />
      </group>
      <group position={end.toArray()} quaternion={endQ}>
        <CelBox args={[1.5, 3.1, 1.5]} color={housing} faded={faded} />
      </group>
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
    const bob = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.12;
    group.current.scale.setScalar(bob);
    group.current.position.y = from[1] + Math.sin(state.clock.elapsedTime * 6) * 1.4;
  });
  return (
    <group ref={group} position={from} quaternion={quat}>
      <CelCyl
        args={[0.22, 0.22, len * 0.62, 8]}
        color={active ? INK : PALE_LINE}
        position={[0, len * 0.38, 0]}
      />
      <mesh position={[0, len * 0.82, 0]}>
        <coneGeometry args={[1.25, 3.4, 10]} />
        <meshToonMaterial color={active ? INK : PALE_LINE} />
        <Outlines screenspace thickness={1.8} color={INK} angle={Math.PI} />
      </mesh>
    </group>
  );
}

export { isApprox, PALE, INK };
