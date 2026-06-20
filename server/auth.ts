import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    if (storedHash.startsWith('$2b$') || storedHash.startsWith('$2a$')) {
      return bcrypt.compare(password, storedHash);
    }
    // Legacy SHA-256 format: "salt:hash"
    const { createHash, timingSafeEqual } = await import("crypto");
    const [salt, hash] = storedHash.split(":");
    if (!salt || !hash) return false;
    const passwordHash = createHash("sha256").update(password + salt).digest("hex");
    const hashBuffer = Buffer.from(hash, "hex");
    const passwordHashBuffer = Buffer.from(passwordHash, "hex");
    if (hashBuffer.length !== passwordHashBuffer.length) return false;
    return timingSafeEqual(hashBuffer, passwordHashBuffer);
  } catch {
    return false;
  }
}
