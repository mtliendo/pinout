"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import {
  boardShortName,
  boardSizeLines,
  US_QUARTER,
  type BoardCard,
} from "@/lib/board-copy";
import { dim } from "@/lib/specs/schema";
import { BoardModel, QuarterModel } from "@/components/scene/models";
import type { Component } from "@/lib/specs/schema";

function asComponent(board: BoardCard): Component {
  return {
    ...board,
    kind: "board",
    provenance: {
      sources: ["specs"],
      verified_by: "Maker",
    },
  } as Component;
}

export function BoardConfirm({ board }: { board: BoardCard }) {
  const length = dim(board.body?.length_mm, 50);
  const width = dim(board.body?.width_mm, 21);
  const lines = boardSizeLines(board);
  return (
    <div className="board-confirm" data-testid="board-confirm">
      <div className="board-confirm-stage">
        <Canvas
          orthographic
          camera={{ position: [80, 70, 90], zoom: 4.2, near: -400, far: 400 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={["#f4efe6"]} />
          <ambientLight intensity={1} />
          <Suspense fallback={null}>
            <group position={[-length / 2 - 8, 0, -width / 2]}>
              <BoardModel component={asComponent(board)} />
            </group>
            <QuarterModel
              position={[length / 2 + US_QUARTER.diameter_mm / 2 + 6, 0.9, 0]}
            />
          </Suspense>
          <OrbitControls
            enablePan={false}
            minZoom={2.2}
            maxZoom={12}
            makeDefault
          />
        </Canvas>
      </div>
      <p className="board-confirm-scale">{US_QUARTER.label}</p>
      <ul className="board-confirm-dims">
        <li>
          <strong>{boardShortName(board)}</strong>
        </li>
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {board.logic?.five_v_logic && (
          <li>5V logic — 3.3V-only parts need care.</li>
        )}
        {(board.breadboard_fit?.fits_830 === false ||
          board.breadboard_fit?.off_board) && (
          <li>Does not sit on an 830 breadboard. Jumpers from female headers.</li>
        )}
      </ul>
    </div>
  );
}
