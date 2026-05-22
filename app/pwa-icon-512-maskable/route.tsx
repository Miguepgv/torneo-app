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
          background: "#312e81",
        }}
      >
        <div
          style={{
            width: 360,
            height: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 84,
            background: "linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)",
            color: "#ffffff",
            fontSize: 190,
            fontWeight: 800,
            fontFamily: "Arial, sans-serif",
          }}
        >
          MC
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
