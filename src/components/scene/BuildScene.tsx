"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
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
    const active = highlights.has(placement.part);
    const present = introduced.has(placement.part) || placement.part === "mcu";
    return { placement, component, world, active, present };
  });

  const wires = build.connections
    .filter((c) => visibleConnections.has(c.id))
    .map((c) => {
      const from = endpointWorld(c.from, payload);
      const to = endpointWorld(c.to, payload);
      const allIndex = build.connections.findIndex((row) => row.id === c.id);
      const long = Boolean(c.length_mm && c.length_mm > 80);
      const lift = 16 + (allIndex % 6) * 5.5 + (long ? 12 : 0);
      const lane = ((allIndex % 2) * 2 - 1) * (4 + allIndex * 2.4);
      const born = step?.connections_added?.indexOf(c.id) ?? -1;
      const stagger = born >= 0 ? born * 0.1 : 0;
      const local = currentConnections.has(c.id)
        ? Math.max(0, Math.min(1, (progress - stagger) / (1 - stagger || 1)))
        : 1;
      return {
        id: c.id,
        points: bezierWire(from, to, lift, lane),
        color: wireColorHex(
          c.color,
          wireColors.signal_palette,
          wireColors.power,
        ),
        current: currentConnections.has(c.id),
        local,
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
          const lift = seating ? (1 - easeOutCubic(progress)) * 38 : 0;
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
            progress={wire.current ? wire.local : 1}
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

const camPose = {
  pos: new THREE.Vector3(),
  look: new THREE.Vector3(),
  frustum: 300,
  primed: false,
};

export function CameraRig({
  payload,
  stepIndex,
  preview,
  resetNonce = 0,
}: {
  payload: GuidePayload;
  stepIndex: number;
  preview?: boolean;
  resetNonce?: number;
}) {
  const { gl, size } = useThree();
  const user = useRef({
    taken: false,
    zoom: 1,
    panX: 0,
    panZ: 0,
  });
  const lastStep = useRef(stepIndex);
  const target = useMemo(() => {
    const step = payload.build.steps[Math.min(stepIndex, payload.build.steps.length - 1)];
    return cameraFor(step?.camera ?? "hero", payload.breadboard, step?.callout);
  }, [payload, stepIndex]);

  useEffect(() => {
    user.current = { taken: false, zoom: 1, panX: 0, panZ: 0 };
  }, [resetNonce]);

  useEffect(() => {
    if (lastStep.current === stepIndex) return;
    lastStep.current = stepIndex;
    user.current.taken = false;
    user.current.zoom = 1;
    user.current.panX = 0;
    user.current.panZ = 0;
  }, [stepIndex]);

  useEffect(() => {
    if (preview) return;
    const el = gl.domElement;
    const drag = { on: false, x: 0, y: 0, pinch: 0 };

    const take = () => {
      user.current.taken = true;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      take();
      user.current.zoom = clamp(
        user.current.zoom * Math.exp(event.deltaY * 0.0016),
        0.32,
        2.6,
      );
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      drag.on = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      el.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag.on) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      take();
      const world = camPose.frustum / Math.max(1, size.height);
      user.current.panX -= dx * world;
      user.current.panZ -= dy * world;
    };

    const onPointerUp = (event: PointerEvent) => {
      drag.on = false;
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        drag.pinch = pinchDist(event.touches);
        drag.x = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        drag.y = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      } else if (event.touches.length === 1) {
        drag.on = true;
        drag.x = event.touches[0].clientX;
        drag.y = event.touches[0].clientY;
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        const next = pinchDist(event.touches);
        if (drag.pinch > 0) {
          take();
          user.current.zoom = clamp(
            user.current.zoom * (drag.pinch / next),
            0.32,
            2.6,
          );
        }
        const mx = (event.touches[0].clientX + event.touches[1].clientX) / 2;
        const my = (event.touches[0].clientY + event.touches[1].clientY) / 2;
        const world = camPose.frustum / Math.max(1, size.height);
        user.current.panX -= (mx - drag.x) * world;
        user.current.panZ -= (my - drag.y) * world;
        drag.pinch = next;
        drag.x = mx;
        drag.y = my;
        return;
      }
      if (!drag.on || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - drag.x;
      const dy = event.touches[0].clientY - drag.y;
      drag.x = event.touches[0].clientX;
      drag.y = event.touches[0].clientY;
      take();
      const world = camPose.frustum / Math.max(1, size.height);
      user.current.panX -= dx * world;
      user.current.panZ -= dy * world;
    };

    const onTouchEnd = () => {
      drag.on = false;
      drag.pinch = 0;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [gl, preview, size.height]);

  useFrame((state, delta) => {
    const cam = state.camera as THREE.OrthographicCamera;
    if (preview) {
      camPose.primed = false;
      const want = { ...target, frustum: 236 };
      applyOrtho(cam, state.size, new THREE.Vector3(...want.position), new THREE.Vector3(...want.lookAt), want.frustum);
      return;
    }
    if (!camPose.primed) {
      camPose.pos.copy(cam.position);
      camPose.look.set(target.lookAt[0], target.lookAt[1], target.lookAt[2]);
      camPose.frustum = 420;
      camPose.primed = true;
    }
    if (!user.current.taken) {
      const k = 1 - Math.exp(-3.1 * delta);
      const want = target;
      camPose.pos.lerp(new THREE.Vector3(...want.position), k);
      camPose.look.lerp(new THREE.Vector3(...want.lookAt), k);
      camPose.frustum += (want.frustum - camPose.frustum) * k;
    }
    const look = camPose.look.clone().add(new THREE.Vector3(user.current.panX, 0, user.current.panZ));
    const pos = camPose.pos.clone().add(new THREE.Vector3(user.current.panX, 0, user.current.panZ));
    applyOrtho(cam, state.size, pos, look, camPose.frustum * user.current.zoom);
    if (typeof document !== "undefined") {
      document.body.dataset.camx = pos.x.toFixed(1);
      document.body.dataset.camz = pos.z.toFixed(1);
      document.body.dataset.camzoom = user.current.zoom.toFixed(2);
    }
  });
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pinchDist(touches: TouchList) {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}

function applyOrtho(
  cam: THREE.OrthographicCamera,
  size: { width: number; height: number },
  pos: THREE.Vector3,
  look: THREE.Vector3,
  frustum: number,
) {
  const aspect = size.width / Math.max(1, size.height);
  const half = frustum / 2;
  cam.left = -half * aspect;
  cam.right = half * aspect;
  cam.top = half;
  cam.bottom = -half;
  cam.near = -900;
  cam.far = 900;
  cam.zoom = 1;
  cam.position.copy(pos);
  cam.lookAt(look);
  cam.updateProjectionMatrix();
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
