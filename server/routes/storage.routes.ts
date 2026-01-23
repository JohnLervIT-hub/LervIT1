import type { Express } from "express";
import { Request, Response, ObjectStorageService, ObjectNotFoundError, requireUser, upload, db, eq } from "./shared";
import path from "path";

export function registerStorageRoutes(app: Express): void {
  const objectStorageService = new ObjectStorageService();

  app.get("/public-objects/:filePath(*)", async (req: Request, res: Response) => {
    const filePath = req.params.filePath;
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req: Request, res: Response) => {
    const objectPath = req.params.objectPath;
    try {
      const file = await objectStorageService.getObject(objectPath);
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "File not found" });
      }
      console.error("Error retrieving object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/objects/upload", upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const uploadedFile = await objectStorageService.uploadFile(req.file);
      res.json({ 
        success: true,
        url: uploadedFile.url,
        path: uploadedFile.path
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });
}
