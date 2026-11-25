import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#6F293E" }}>
        <svg width="300" height="300" viewBox="0 0 24 24">
          <path d="M12 20.3c-.3 0-.6-.1-.8-.3C6.4 16 3 12.9 3 9.2 3 6.6 5 4.6 7.5 4.6c1.6 0 3.2.8 4.5 2.4 1.3-1.6 2.9-2.4 4.5-2.4C19 4.6 21 6.6 21 9.2c0 3.7-3.4 6.8-8.2 10.8-.2.2-.5.3-.8.3Z" fill="#F3DDE5" />
        </svg>
      </div>
    ),
    size,
  );
}
