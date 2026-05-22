import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 40,
          background: "linear-gradient(135deg, #4f46e5 0%, #312e81 100%)",
          color: "#ffffff",
          fontSize: 92,
          fontWeight: 800,
          fontFamily: "Arial, sans-serif",
        }}
      >
        MC
      </div>
    ),
    { width: 192, height: 192 },
  );
}
