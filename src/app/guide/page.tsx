import { Suspense } from "react";
import { BuildViewer } from "@/components/viewer/BuildViewer";

export default function GuidePage() {
  return (
    <Suspense fallback={<main className="ask"><p className="ask-status">Opening the bench…</p></main>}>
      <BuildViewer />
    </Suspense>
  );
}
