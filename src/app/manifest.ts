import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ours. — Abdullah & Lara",
    short_name: "ours.",
    description: "just us, in our own little universe.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F5",
    theme_color: "#FAF7F5",
    orientation: "portrait",
    lang: "de",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
