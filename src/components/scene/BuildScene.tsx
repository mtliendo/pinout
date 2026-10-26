"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import {
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
import { dim } from "@/lib/specs/schema";

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
  build.steps.forEach((s, i) => {
    if (i <= stepIndex) {
      for (const id of s.parts_needed ?? []) introduced.add(id);
    }
  });

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
        points: bezierWire(from, to, c.length_mm && c.length_mm > 80 ? 16 : 9),
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

  return (
    <group>
      <BreadboardModel breadboard={breadboard} faded={false} />
      {placed.map(({ placement, component, world, active, present }) => {
        if (!component || !present) return null;
        const fade =
          placement.part !== "mcu" &&
          placement.part !== "bb" &&
          !active &&
          stepIndex < build.steps.length - 1;
        const lift = active ? 0 : 0;
        return (
          <group
            key={placement.part}
            position={[world.position[0], world.position[1] + lift + (preview ? 0 : 0), world.position[2]]}
            rotation={[0, world.rotation, 0]}
          >
            {component.kind === "board" ? (
              <BoardModel component={component} faded={fade && !active} />
            ) : (
              <CatalogPart
                component={component}
                faded={fade && !active}
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
          faded={!wire.current && stepIndex < build.steps.length - 1}
        />
      ))}
      {calloutPos && !preview && (
        <GuideArrow
          from={[calloutPos[0], calloutPos[1] + 18, calloutPos[2]]}
          to={[calloutPos[0], calloutPos[1] + 3, calloutPos[2]]}
          active
        />
      )}
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
  const spin = useRef(0);

  useFrame((state, delta) => {
    if (preview) {
      spin.current += delta * 0.18;
      const length = dim(payload.breadboard.body?.length_mm, 165);
      const cx = length / 2;
      const cz = 14;
      const cam = state.camera as THREE.PerspectiveCamera;
      cam.fov += (40 - cam.fov) * 0.08;
      cam.updateProjectionMatrix();
      state.camera.position.set(
        cx + Math.sin(spin.current) * 155,
        110,
        cz + Math.cos(spin.current) * 130,
      );
      state.camera.lookAt(cx, 6, cz);
      return;
    }
    pos.current.lerp(new THREE.Vector3(...target.position), 1 - Math.pow(0.001, delta));
    look.current.lerp(new THREE.Vector3(...target.lookAt), 1 - Math.pow(0.001, delta));
    state.camera.position.copy(pos.current);
    state.camera.lookAt(look.current);
    if (target.fov) {
      const cam = state.camera as THREE.PerspectiveCamera;
      cam.fov += (target.fov - cam.fov) * 0.08;
      cam.updateProjectionMatrix();
    }
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
