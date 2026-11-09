"use client";

import dynamic from "next/dynamic";

// Camera state reads localStorage on first render, so it only renders on the client.
export const CameraClient = dynamic(() => import("./CameraScreen").then((m) => m.CameraScreen), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-black" />,
});
