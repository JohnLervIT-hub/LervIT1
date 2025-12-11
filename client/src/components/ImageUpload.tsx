import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, X, Image as ImageIcon, Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadProps {
  onImagesChange: (urls: string[]) => void;
  onAnalyze?: (urls: string[]) => void;
  maxImages?: number;
}

async function compressImage(file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    img.onload = () => {
      let { width, height } = img;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      canvas.width = width;
      canvas.height = height;
      
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      } else {
        reject(new Error('Could not get canvas context'));
      }
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

export default function ImageUpload({ onImagesChange, onAnalyze, maxImages = 10 }: ImageUploadProps) {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    // Start upload process
    
    if (images.length + fileArray.length > maxImages) {
      toast({
        title: "Too many images",
        description: `You can upload a maximum of ${maxImages} images.`,
        variant: "destructive",
      });
      return;
    }

    const validFiles = fileArray.filter(file => {
      if (file.type && file.type.startsWith('image/')) {
        return true;
      }
      const ext = file.name.toLowerCase().split('.').pop();
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tiff', 'tif'];
      if (ext && allowedExtensions.includes(ext)) {
        return true;
      }
      if (!file.type && file.size > 0 && file.size < 20 * 1024 * 1024) {
        return true;
      }
      return false;
    });

    if (validFiles.length === 0) {
      toast({
        title: "Invalid files",
        description: "Could not process the selected files. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    
    try {
      const processedFiles: { blob: Blob; name: string; wasCompressed: boolean }[] = [];
      
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setUploadProgress(Math.round((i / validFiles.length) * 50));
        
        const isCompressibleFormat = file.type.startsWith('image/') && 
          !file.type.includes('heic') && !file.type.includes('heif') &&
          !file.name.toLowerCase().endsWith('.heic') && !file.name.toLowerCase().endsWith('.heif');
        
        try {
          if (isCompressibleFormat && file.size > 500 * 1024) {
              const compressed = await compressImage(file);
            processedFiles.push({ 
              blob: compressed, 
              name: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
              wasCompressed: true 
            });
          } else {
            processedFiles.push({ blob: file, name: file.name, wasCompressed: false });
          }
        } catch {
          processedFiles.push({ blob: file, name: file.name, wasCompressed: false });
        }
      }
      
      setUploadProgress(60);
      
      const formData = new FormData();
      processedFiles.forEach(({ blob, name }) => {
        formData.append('images', blob, name);
      });

      // Upload to server
      
      const response = await fetch('/api/upload/images', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(90);
      
      if (!response.ok) {
        throw new Error('Upload failed. Please try again.');
      }

      const data = await response.json();
      
      const newImages = [...images, ...data.urls];
      setImages(newImages);
      onImagesChange(newImages);
      setUploadProgress(100);
      
      toast({
        title: "Upload complete",
        description: `${validFiles.length} image(s) uploaded successfully.`,
      });
      
      if (onAnalyze) {
        onAnalyze(newImages);
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unable to upload images. Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [images, maxImages, onImagesChange, onAnalyze, toast]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await uploadFiles(files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const relatedTarget = e.relatedTarget as Node;
    if (!e.currentTarget.contains(relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading || images.length >= maxImages) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFiles(files);
    }
  };

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    onImagesChange(newImages);
  };

  const triggerFileInput = () => {
    const fileInput = document.getElementById('image-upload') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          onClick={!uploading ? triggerFileInput : undefined}
          className={uploading ? '' : 'cursor-pointer'}
        >
          <Card className={`relative border-2 border-dashed p-6 sm:p-8 text-center transition-all duration-200 ${
            uploading 
              ? 'border-primary bg-primary/5' 
              : isDragging 
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10' 
                : 'border-primary/30 hover:border-primary hover:bg-primary/5'
          }`}>
            {/* Upload Progress Overlay */}
            {uploading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center z-10">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                <p className="font-semibold text-primary">Uploading...</p>
                <div className="w-48 h-2 bg-muted rounded-full mt-3 overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{uploadProgress}%</p>
              </div>
            )}
            
            <div className="flex flex-col items-center gap-3">
              <div className={`p-4 rounded-full transition-colors ${
                isDragging ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
              }`}>
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <p className={`font-bold text-lg ${isDragging ? 'text-primary' : ''}`}>
                  {isDragging ? 'Drop images here' : 'Upload Photos'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isDragging ? 'Release to upload' : 'Drag & drop or click to select'}
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium">
                    Required: At least 1 photo
                  </span>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full">
                    Max {maxImages} images
                  </span>
                </div>
              </div>
              {!isDragging && !uploading && (
                <Button
                  type="button"
                  className="mt-2"
                  disabled={images.length >= maxImages}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFileInput();
                  }}
                  data-testid="button-select-images"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Select Images
                </Button>
              )}
            </div>
          </Card>
        </div>
        <input
          id="image-upload"
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading || images.length >= maxImages}
          data-testid="input-image-upload"
        />
      </div>

      {images.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Uploaded ({images.length}/{maxImages})
            </p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {images.map((url, index) => (
              <div key={index} className="relative group aspect-square">
                <Card className="overflow-hidden h-full">
                  <img
                    src={url}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    data-testid={`image-preview-${index}`}
                  />
                </Card>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  onClick={() => removeImage(index)}
                  data-testid={`button-remove-image-${index}`}
                  aria-label={`Remove image ${index + 1}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
