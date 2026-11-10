import { Suspense } from "react";
import type { Metadata } from "next";
import { SimulatorView } from "@/components/simulator/simulator-view";

export const metadata: Metadata = { title: "Simulator" };

export default function SimulatorPage() {
  return (
    <div className="container">
      <Suspense>
        <SimulatorView />
      </Suspense>
    </div>
  );
}
