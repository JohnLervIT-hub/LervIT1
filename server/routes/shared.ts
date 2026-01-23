import type { Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db, pool } from "../db";
import multer from "multer";
import path from "path";
import fs from "fs";
import { stripe, PLATFORM_COMMISSION, calculatePlatformFee } from "../config/stripe";
import { notificationService } from "../notifications";
import { logger, logEvent } from "../logger";
import { ObjectStorageService, ObjectNotFoundError } from "../objectStorage";
import { format } from "date-fns";
import { eq, and, notInArray, sql, desc, inArray, lt, or, isNull } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../auth";
import { calculateDistance } from "../utils/distance";
import Stripe from "stripe";

export { storage, db, pool, stripe, PLATFORM_COMMISSION, calculatePlatformFee };
export { notificationService, logger, logEvent };
export { ObjectStorageService, ObjectNotFoundError };
export { format };
export { eq, and, notInArray, sql, desc, inArray, lt, or, isNull };
export { hashPassword, verifyPassword };
export { calculateDistance };
export { z };
export type { Request, Response };

export function validateBody<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/^\+/, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `1-${cleaned.slice(1, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export function maskAddressForPrivacy(location: string | null): string {
  if (!location) return "Calgary, AB";
  
  const parts = location.split(',').map(p => p.trim());
  const isStreetAddress = (part: string): boolean => /\d/.test(part);
  const cleanPostalCode = (part: string): string => part.replace(/[A-Z]\d[A-Z]\s*\d[A-Z]\d/gi, '').trim();
  
  if (parts.length === 1) {
    if (isStreetAddress(parts[0])) return "Calgary, AB";
    const cleaned = cleanPostalCode(parts[0]);
    return cleaned.toLowerCase().includes('calgary') ? "Calgary, AB" : (cleaned || "Calgary, AB");
  }
  
  if (parts.length === 2) {
    const firstPart = cleanPostalCode(parts[0]);
    const secondPart = cleanPostalCode(parts[1]);
    if (isStreetAddress(parts[0])) {
      if (secondPart.toLowerCase().includes('calgary')) return "Calgary, AB";
      return secondPart && secondPart.length > 2 ? `${secondPart}, AB` : "Calgary, AB";
    }
    if (firstPart.toLowerCase().includes('calgary')) return "Calgary, AB";
    return `${firstPart}, ${secondPart}`;
  }
  
  if (parts.length >= 3) {
    const city = cleanPostalCode(parts[parts.length - 2]);
    const province = cleanPostalCode(parts[parts.length - 1]);
    if (city.toLowerCase().includes('calgary')) return "Calgary, AB";
    return city && city.length > 2 ? `${city}, ${province || 'AB'}` : "Calgary, AB";
  }
  
  return "Calgary, AB";
}

export async function authMiddleware(req: Request, res: Response, next: Function) {
  if (req.session?.userId) {
    try {
      const user = await storage.getUser(req.session.userId);
      if (user) {
        (req as any).user = user;
      }
    } catch (error) {
      req.session.destroy(() => {});
    }
  }
  next();
}

export function requireUser(req: Request, res: Response): boolean {
  if (!(req as any).user) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  return true;
}

export function requireAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage_multer = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const upload = multer({
  storage: storage_multer,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = /jpeg|jpg|png|gif|webp|heic|heif|avif/;
    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    const allowedMimeTypes = /image\/(jpeg|jpg|png|gif|webp|heic|heif|avif)/;
    const mimetypeValid = allowedMimeTypes.test(file.mimetype) || file.mimetype.startsWith('image/');
    if (extname || mimetypeValid) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
  }
});

export * from "@shared/schema";
