import sharp from "sharp";
import heicConvert from "heic-convert";

const MAX_WIDTH = 800;
const WEBP_QUALITY = 80;

export interface OptimizedImage {
  buffer: Buffer;
  filename: string;
  mimetype: "image/webp";
}

function isHeic(mimetype: string, filename: string): boolean {
  return mimetype === "image/heic"
    || mimetype === "image/heif"
    || /\.(heic|heif)$/i.test(filename);
}

function stripExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}

/**
 * Decode HEIC when needed, resize to fit ≤MAX_WIDTH, re-encode as WebP q=80.
 * Callers persist the returned filename/mimetype so downstream reads never
 * need to run heic-convert or any other transform.
 */
export async function optimizeImageBuffer(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<OptimizedImage> {
  let input = buffer;
  if (isHeic(mimetype, filename)) {
    const jpeg = await heicConvert({ buffer: input, format: "JPEG", quality: 0.9 });
    input = Buffer.from(jpeg);
  }

  const optimized = await sharp(input, { failOn: "none" })
    .rotate() // honour EXIF orientation before we throw the metadata away
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  return {
    buffer: optimized,
    filename: `${stripExtension(filename)}.webp`,
    mimetype: "image/webp",
  };
}
