import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadProps {
  onImagesChange: (urls: string[]) => void;
  maxImages?: number;
}

export default function ImageUpload({ onImagesChange, maxImages = 10 }: ImageUploadProps) {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    if (images.length + fileArray.length > maxImages) {
      toast({
        title: "Too many images",
        description: `You can upload a maximum of ${maxImages} images.`,
        variant: "destructive",
      });
      return;
    }

    // Validate file types
    const validFiles = fileArray.filter(file => {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      return allowedTypes.includes(file.type);
    });

    if (validFiles.length !== fileArray.length) {
      toast({
        title: "Invalid files",
        description: "Only image files (JPG, PNG, GIF, WebP) are allowed.",
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
      const response = await fetch('/api/upload/images', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      const newImages = [...images, ...data.urls];
      setImages(newImages);
      onImagesChange(newImages);
      
      toast({
        title: "Success",
        description: `${validFiles.length} image(s) uploaded successfully.`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload images. Please try again.",
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
          <Card className={`border-2 border-dashed hover-elevate active-elevate-2 p-8 text-center transition-colors ${
            isDragging ? 'border-primary bg-primary/5' : ''
          }`}>
            <div className="flex flex-col items-center gap-2">
              <Upload className={`w-8 h-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
              <div>
                <p className="font-medium">
                  {isDragging ? 'Drop images here' : 'Upload Images'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isDragging ? 'Release to upload' : 'Drag & drop or click to select images'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Max {maxImages} images, 5MB each (JPG, PNG, GIF, WebP)
                </p>
              </div>
              {!isDragging && (
                <Button
                  type="button"
                  variant="outline"
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
          accept="image/*"
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
