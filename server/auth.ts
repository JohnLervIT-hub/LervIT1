import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(password + salt)
    .digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(":");
    const passwordHash = createHash("sha256")
      .update(password + salt)
      .digest("hex");
    
    const hashBuffer = Buffer.from(hash, "hex");
    const passwordHashBuffer = Buffer.from(passwordHash, "hex");
    
    return timingSafeEqual(hashBuffer, passwordHashBuffer);
  } catch {
    return false;
  }
}
