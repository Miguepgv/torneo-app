import sharp from "sharp";

export async function prepareImageForUpload(
  file: File,
  maxSide = 2400,
): Promise<{ buffer: Buffer; contentType: string }> {
  const input = Buffer.from(await file.arrayBuffer());
  try {
    const buffer = await sharp(input)
      .rotate()
      .resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { buffer, contentType: "image/jpeg" };
  } catch {
    return { buffer: input, contentType: file.type || "application/octet-stream" };
  }
}
