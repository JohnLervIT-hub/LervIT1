import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadProps {
  onImagesChange: (urls: string[]) => void;
  onAnalyze?: (urls: string[]) => void;
  maxImages?: number;
}

export default function ImageUpload({ onImagesChange, onAnalyze, maxImages = 10 }: ImageUploadProps) {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    console.log('[ImageUpload] Starting upload for', fileArray.length, 'files');
    fileArray.forEach((file, i) => {
      console.log(`[ImageUpload] File ${i + 1}:`, file.name, file.type, file.size, 'bytes');
    });
    
    if (images.length + fileArray.length > maxImages) {
      toast({
        title: "Too many images",
        description: `You can upload a maximum of ${maxImages} images.`,
        variant: "destructive",
      });
      return;
    }

    // Validate file types - support mobile formats including HEIC/HEIF
    // Be very lenient for mobile compatibility
    const validFiles = fileArray.filter(file => {
      // Accept any file that has image in its MIME type
      if (file.type && file.type.startsWith('image/')) {
        console.log('[ImageUpload] Accepted by MIME type:', file.type);
        return true;
      }
      // Fallback: check file extension
      const ext = file.name.toLowerCase().split('.').pop();
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tiff', 'tif'];
      if (ext && allowedExtensions.includes(ext)) {
        console.log('[ImageUpload] Accepted by extension:', ext);
        return true;
      }
      // If no MIME type but has a reasonable file size, accept it (mobile quirk)
      if (!file.type && file.size > 0 && file.size < 20 * 1024 * 1024) {
        console.log('[ImageUpload] Accepted without MIME type (mobile fallback)');
        return true;
      }
      console.log('[ImageUpload] Rejected file:', file.name, file.type);
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
    const formData = new FormData();
    
    for (let i = 0; i < validFiles.length; i++) {
      formData.append('images', validFiles[i]);
    }

    try {
      console.log('[ImageUpload] Sending upload request...');
      const response = await fetch('/api/upload/images', {
        method: 'POST',
        body: formData,
      });

      console.log('[ImageUpload] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ImageUpload] Upload failed:', response.status, errorText);
        throw new Error(`Upload failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('[ImageUpload] Upload successful, URLs:', data.urls);
      
      const newImages = [...images, ...data.urls];
      setImages(newImages);
      onImagesChange(newImages);
      
      toast({
        title: "Success",
        description: `${validFiles.length} image(s) uploaded successfully.`,
      });
      
      // Trigger auto-analyze after upload if callback provided
      if (onAnalyze) {
        console.log('[ImageUpload] Triggering auto-analyze for', newImages.length, 'images');
        onAnalyze(newImages);
      }
    } catch (error) {
      console.error('[ImageUpload] Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload images. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

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
    
    // Only clear isDragging if we're actually leaving the drop zone
    // (not just entering a child element)
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
          onClick={triggerFileInput}
          className="cursor-pointer"
        >
          <Card className={`border-2 border-dashed p-8 text-center transition-all duration-200 hover:scale-[1.02] hover:shadow-lg ${
            isDragging 
              ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 shadow-lg shadow-orange-500/20' 
              : 'border-orange-300 dark:border-orange-600 bg-orange-50/50 dark:bg-orange-950/10 hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20'
          }`}>
            <div className="flex flex-col items-center gap-3">
              <div className={`p-3 rounded-full ${isDragging ? 'bg-orange-500 text-white' : 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400'}`}>
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <p className={`font-bold text-lg ${isDragging ? 'text-orange-600 dark:text-orange-400' : 'text-gray-800 dark:text-gray-200'}`}>
                  {isDragging ? 'Drop images here' : 'Upload Photos'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isDragging ? 'Release to upload' : 'Drag & drop or click to select images'}
                </p>
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium mt-2">
                  Required: At least 1 photo of your items
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Max {maxImages} images, 5MB each (JPG, PNG, GIF, WebP)
                </p>
              </div>
              {!isDragging && (
                <Button
                  type="button"
                  className="bg-orange-500 hover:bg-orange-600 text-white mt-2"
                  disabled={uploading || images.length >= maxImages}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFileInput();
                  }}
                  data-testid="button-select-images"
                >
                  <ImageIcon className="w-4 h-4 mr-2" />
                  {uploading ? "Uploading..." : "Select Images"}
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
          <p className="text-sm font-medium mb-2">
            Uploaded Images ({images.length}/{maxImages})
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {images.map((url, index) => (
              <div key={index} className="relative group">
                <Card className="overflow-hidden">
                  <img
                    src={url}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-32 object-cover"
                    data-testid={`image-preview-${index}`}
                  />
                </Card>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeImage(index)}
                  data-testid={`button-remove-image-${index}`}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
