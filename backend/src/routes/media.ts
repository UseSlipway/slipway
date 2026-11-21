import { createHash, randomUUID } from "node:crypto";
import { Router } from "express";

export const mediaRouter = Router();

function cloudinaryCredentials() {
  let cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  let apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  let apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if ((!cloudName || !apiKey || !apiSecret) && process.env.CLOUDINARY_URL) {
    try {
      const url = new URL(process.env.CLOUDINARY_URL);
      cloudName ||= url.hostname;
      apiKey ||= decodeURIComponent(url.username);
      apiSecret ||= decodeURIComponent(url.password);
    } catch {
      // Fall through to the single, safe configuration error below.
    }
  }
  if (!cloudName || !apiKey || !apiSecret || !/^[a-zA-Z0-9-]+$/.test(cloudName)) return null;
  return { cloudName, apiKey, apiSecret };
}

function validImage(bytes: Buffer, mimeType: string) {
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/gif") return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  if (mimeType === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

mediaRouter.post("/media/images", async (request, response) => {
  const credentials = cloudinaryCredentials();
  if (!credentials) {
    response.status(503).json({ error: "Image storage is not configured" });
    return;
  }

  const match = typeof request.body?.image === "string"
    ? request.body.image.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
    : null;
  if (!match || !match[2] || match[2].length > 2_800_000) {
    response.status(400).json({ error: "Choose a PNG, JPG, GIF or WebP image up to 2 MB" });
    return;
  }

  const mimeType = match[1]!;
  const image = Buffer.from(match[2], "base64");
  if (!image.length || image.length > 2 * 1024 * 1024 || !validImage(image, mimeType)) {
    response.status(400).json({ error: "The uploaded image is invalid or exceeds 2 MB" });
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = "slipway/tokens";
  const publicId = randomUUID();
  const signatureInput = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${credentials.apiSecret}`;
  const signature = createHash("sha1").update(signatureInput).digest("hex");
  const form = new FormData();
  form.set("file", new Blob([image], { type: mimeType }), `${publicId}`);
  form.set("api_key", credentials.apiKey);
  form.set("timestamp", timestamp);
  form.set("folder", folder);
  form.set("public_id", publicId);
  form.set("signature", signature);

  try {
    const upload = await fetch(`https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/upload`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30_000)
    });
    const result = await upload.json() as { secure_url?: unknown; public_id?: unknown };
    if (!upload.ok || typeof result.secure_url !== "string" || !result.secure_url.startsWith("https://res.cloudinary.com/")) {
      response.status(502).json({ error: "Could not store the token image" });
      return;
    }
    response.setHeader("Cache-Control", "no-store").status(201).json({ url: result.secure_url, publicId: result.public_id });
  } catch {
    response.status(502).json({ error: "Image storage is temporarily unavailable" });
  }
});
