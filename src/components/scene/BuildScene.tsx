"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import {
  assemblyFrame,
  bezierWire,
  cameraFor,
  holeWorld,
  wireColorHex,
  type Vec3,
} from "@/lib/geometry";
import type { GuidePayload } from "@/lib/types";
import {
  BoardModel,
  BreadboardModel,
  CatalogPart,
  GrowingWire,
  GuideArrow,
  partWorld,
} from "./models";

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function BuildScene({
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
  const { build, components, breadboard, wireColors } = payload;
  const step = build.steps[Math.min(stepIndex, build.steps.length - 1)];
  const visibleConnections = new Set<string>();
  build.steps.forEach((s, i) => {
    if (i <= stepIndex) {
      for (const id of s.connections_added ?? []) visibleConnections.add(id);
    }
  });
  const currentConnections = new Set(step?.connections_added ?? []);
  const highlights = new Set(step?.highlight ?? []);
  const introduced = new Set<string>();
  const firstSeen = new Map<string, number>();
  build.steps.forEach((s, i) => {
    if (i <= stepIndex) {
      for (const id of s.parts_needed ?? []) {
        introduced.add(id);
        if (!firstSeen.has(id)) firstSeen.set(id, i);
      }
    }
  });
  if (!firstSeen.has("mcu")) firstSeen.set("mcu", 0);

  const placed = build.placements.map((placement) => {
    const part = build.parts.find((p) => p.id === placement.part);
    const component = part ? components[part.component] : undefined;
    const world = component
      ? partWorld(placement, component, breadboard)
      : { position: [0, 0, 0] as Vec3, rotation: 0 };
    const active =
      highlights.has(placement.part) ||
      (component?.pins ?? []).some((p) => highlights.has(p.id));
    const present = introduced.has(placement.part) || placement.part === "mcu";
    return { placement, component, world, active, present };
  });

  const wires = build.connections
    .filter((c) => visibleConnections.has(c.id))
    .map((c) => {
      const from = endpointWorld(c.from, payload);
      const to = endpointWorld(c.to, payload);
      return {
        id: c.id,
        points: bezierWire(from, to, c.length_mm && c.length_mm > 80 ? 22 : 15),
        color: wireColorHex(
          c.color,
          wireColors.signal_palette,
          wireColors.power,
        ),
        current: currentConnections.has(c.id),
      };
    });

  const callout = step?.callout;
  const calloutPos = calloutWorld(callout, payload);
  const pivot = assemblyFrame(breadboard).lookAt;
  const spin = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (preview && spin.current) {
      spin.current.rotation.y += delta * 0.2;
    }
  });

  return (
    <group ref={spin} position={preview ? [pivot[0], 0, pivot[2]] : [0, 0, 0]}>
      <group position={preview ? [-pivot[0], 0, -pivot[2]] : [0, 0, 0]}>
        <BreadboardModel breadboard={breadboard} faded={false} />
        {placed.map(({ placement, component, world, active, present }) => {
          if (!component || !present) return null;
          const fade = !preview && !active && stepIndex < build.steps.length - 1;
          const born = firstSeen.get(placement.part) ?? 0;
          const seating = !preview && born === stepIndex;
          const lift = seating ? (1 - easeOutCubic(progress)) * 28 : 0;
          return (
            <group
              key={placement.part}
              position={[world.position[0], world.position[1] + lift, world.position[2]]}
              rotation={[0, world.rotation, 0]}
            >
              {component.kind === "board" ? (
                <BoardModel component={component} faded={fade} />
              ) : (
                <CatalogPart
                  component={component}
                  faded={fade}
                  active={active}
                />
              )}
            </group>
          );
        })}
        {wires.map((wire) => (
          <GrowingWire
            key={wire.id}
            points={wire.points}
            color={wire.color}
            progress={wire.current ? progress : 1}
            faded={!preview && !wire.current && stepIndex < build.steps.length - 1}
          />
        ))}
        {calloutPos && !preview && (
          <GuideArrow
            from={[calloutPos[0], calloutPos[1] + 22, calloutPos[2]]}
            to={[calloutPos[0], calloutPos[1] + 3, calloutPos[2]]}
            active
          />
        )}
      </group>
    </group>
  );
}

export function CameraRig({
  payload,
  stepIndex,
  preview,
}: {
  payload: GuidePayload;
  stepIndex: number;
  preview?: boolean;
}) {
  const target = useMemo(() => {
    const step = payload.build.steps[Math.min(stepIndex, payload.build.steps.length - 1)];
    return cameraFor(step?.camera ?? "hero", payload.breadboard, step?.callout);
  }, [payload, stepIndex]);
  const pos = useRef(new THREE.Vector3(...target.position));
  const look = useRef(new THREE.Vector3(...target.lookAt));
  const frustum = useRef(target.frustum);

  useFrame((state, delta) => {
    const cam = state.camera as THREE.OrthographicCamera;
    const k = 1 - Math.exp(-2.2 * delta);
    const want = preview
      ? { ...target, frustum: target.frustum + 20 }
      : target;
    pos.current.lerp(new THREE.Vector3(...want.position), preview ? 1 : k);
    look.current.lerp(new THREE.Vector3(...want.lookAt), preview ? 1 : k);
    frustum.current += (want.frustum - frustum.current) * (preview ? 1 : k);
    const aspect = state.size.width / Math.max(1, state.size.height);
    const half = frustum.current / 2;
    cam.left = -half * aspect;
    cam.right = half * aspect;
    cam.top = half;
    cam.bottom = -half;
    cam.near = -900;
    cam.far = 900;
    cam.zoom = 1;
    cam.position.copy(pos.current);
    cam.lookAt(look.current);
    cam.updateProjectionMatrix();
  });
  return null;
}

export function CalloutProjector({
  world,
  onScreen,
}: {
  world: Vec3 | null;
  onScreen?: (xy: { x: number; y: number } | null) => void;
}) {
  useFrame(({ camera, size }) => {
    if (!onScreen) return;
    if (!world) {
      onScreen(null);
      return;
    }
    const v = new THREE.Vector3(world[0], world[1], world[2]).project(camera);
    if (v.z > 1) {
      onScreen(null);
      return;
    }
    onScreen({
      x: (v.x * 0.5 + 0.5) * size.width,
      y: (-v.y * 0.5 + 0.5) * size.height,
    });
  });
  return null;
}

function endpointWorld(end: string, payload: GuidePayload): Vec3 {
  if (!end.includes(":")) {
    return holeWorld(end, payload.breadboard, 1.6);
  }
  const [partId] = end.split(":");
  const placement = payload.build.placements.find((p) => p.part === partId);
  const part = payload.build.parts.find((p) => p.id === partId);
  const component = part ? payload.components[part.component] : undefined;
  if (!placement || !component) return [0, 8, 0];
  const world = partWorld(placement, component, payload.breadboard);
  return [world.position[0], world.position[1] + 4, world.position[2]];
}

export function calloutWorld(
  callout: string | undefined,
  payload: GuidePayload,
): Vec3 | null {
  if (!callout) return null;
  if (callout === "usb_uart") {
    return [58, 8, 6];
  }
  if (!callout.includes(":")) {
    try {
      return holeWorld(callout, payload.breadboard, 2);
    } catch {
      return [0, 4, 0];
    }
  }
  return endpointWorld(callout, payload);
}
