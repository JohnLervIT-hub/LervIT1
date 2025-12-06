import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, X, Image as ImageIcon, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import imageCompression from "browser-image-compression";

interface ImageUploadProps {
  onImagesChange: (urls: string[]) => void;
  onAnalyze?: (urls: string[]) => void;
  maxImages?: number;
}

interface UploadProgress {
  file: string;
  progress: number;
  status: 'compressing' | 'uploading' | 'done' | 'error';
}

const MAX_CONCURRENT_UPLOADS = 3;

export default function ImageUpload({ onImagesChange, onAnalyze, maxImages = 10 }: ImageUploadProps) {
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const { toast } = useToast();

  const isHeicFile = (file: File): boolean => {
    const ext = file.name.toLowerCase().split('.').pop();
    return ext === 'heic' || ext === 'heif' || file.type.includes('heic') || file.type.includes('heif');
  };

  const needsCompression = (file: File): boolean => {
    return file.size > 1.5 * 1024 * 1024 || isHeicFile(file);
  };

  const compressImage = async (file: File): Promise<File> => {
    if (!needsCompression(file)) {
      console.log('[ImageUpload] File already optimized:', file.name, (file.size / 1024 / 1024).toFixed(2), 'MB');
      return file;
    }

    const isHeic = isHeicFile(file);
    
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      ...(isHeic ? { fileType: 'image/jpeg' as const } : {}),
      initialQuality: 0.85,
    };

    try {
      console.log('[ImageUpload] Compressing:', file.name, 'Size:', (file.size / 1024 / 1024).toFixed(2), 'MB', isHeic ? '(HEIC→JPEG)' : '');
      const compressedFile = await imageCompression(file, options);
      console.log('[ImageUpload] Compressed:', file.name, 'New size:', (compressedFile.size / 1024 / 1024).toFixed(2), 'MB');
      return compressedFile;
    } catch (error) {
      console.warn('[ImageUpload] Compression failed for', file.name, '- using original:', error);
      return file;
    }
  };

  const uploadWithProgress = (formData: FormData, onProgress: (progress: number) => void): Promise<{ urls: string[] }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            reject(new Error('Invalid response'));
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });
      
      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
      
      xhr.open('POST', '/api/upload/images');
      xhr.send(formData);
    });
  };

  const uploadSingleFile = async (file: File, index: number): Promise<string | null> => {
    try {
      setUploadProgress(prev => prev.map((p, i) => 
        i === index ? { ...p, status: 'compressing' as const, progress: 5 } : p
      ));

      const compressedFile = await compressImage(file);
      
      setUploadProgress(prev => prev.map((p, i) => 
        i === index ? { ...p, status: 'uploading' as const, progress: 15 } : p
      ));

      const formData = new FormData();
      formData.append('images', compressedFile);

      const response = await uploadWithProgress(formData, (progress) => {
        const adjustedProgress = 15 + (progress * 0.85);
        setUploadProgress(prev => prev.map((p, i) => 
          i === index ? { ...p, progress: Math.round(adjustedProgress) } : p
        ));
      });

      setUploadProgress(prev => prev.map((p, i) => 
        i === index ? { ...p, status: 'done' as const, progress: 100 } : p
      ));

      return response.urls[0];
    } catch (error) {
      console.error('[ImageUpload] Upload error for', file.name, ':', error);
      setUploadProgress(prev => prev.map((p, i) => 
        i === index ? { ...p, status: 'error' as const, progress: 0 } : p
      ));
      return null;
    }
  };

  const uploadWithConcurrencyLimit = async (
    files: File[], 
    limit: number
  ): Promise<(string | null)[]> => {
    const results: (string | null)[] = new Array(files.length).fill(null);
    let currentIndex = 0;
    
    const worker = async () => {
      while (currentIndex < files.length) {
        const index = currentIndex++;
        results[index] = await uploadSingleFile(files[index], index);
      }
    };

    const workers = Array(Math.min(limit, files.length)).fill(null).map(() => worker());
    await Promise.all(workers);
    
    return results;
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    console.log('[ImageUpload] Starting upload for', fileArray.length, 'files');
    
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
    setUploadProgress(validFiles.map(f => ({ 
      file: f.name, 
      progress: 0, 
      status: 'compressing' as const 
    })));

    try {
      const results = await uploadWithConcurrencyLimit(validFiles, MAX_CONCURRENT_UPLOADS);
      
      const successfulUrls = results.filter((url): url is string => url !== null);
      const failedCount = results.length - successfulUrls.length;

      if (successfulUrls.length > 0) {
        const newImages = [...images, ...successfulUrls];
        setImages(newImages);
        onImagesChange(newImages);
        
        toast({
          title: "Upload Complete",
          description: failedCount > 0 
            ? `${successfulUrls.length} uploaded, ${failedCount} failed`
            : `${successfulUrls.length} image(s) uploaded`,
        });

        if (onAnalyze) {
          onAnalyze(newImages);
        }
      } else {
        toast({
          title: "Upload Failed",
          description: "All uploads failed. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('[ImageUpload] Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload images.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress([]), 1500);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    await uploadFiles(files);
    e.target.value = '';
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const relatedTarget = e.relatedTarget as Node;
    if (!e.currentTarget.contains(relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (uploading || images.length >= maxImages) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFiles(files);
    }
  }, [uploading, images.length, maxImages]);

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

  const getStatusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'compressing':
        return <Loader2 className="w-3 h-3 animate-spin text-amber-500" />;
      case 'uploading':
        return <Loader2 className="w-3 h-3 animate-spin text-primary" />;
      case 'done':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'error':
        return <X className="w-3 h-3 text-red-500" />;
    }
  };

  const getStatusText = (item: UploadProgress) => {
    switch (item.status) {
      case 'compressing':
        return 'Optimizing...';
      case 'uploading':
        return `${item.progress}%`;
      case 'done':
        return 'Done';
      case 'error':
        return 'Failed';
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
          <Card className={`border-2 border-dashed p-6 text-center transition-all duration-200 ${
            isDragging 
              ? 'border-primary bg-primary/5 shadow-lg' 
              : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30'
          }`}>
            <div className="flex flex-col items-center gap-3">
              <div className={`p-3 rounded-full ${isDragging ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold">
                  {isDragging ? 'Drop images here' : 'Upload Photos'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isDragging ? 'Release to upload' : 'Drag & drop or click to select'}
                </p>
                <p className="text-xs text-primary font-medium mt-2">
                  Required: At least 1 photo
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-optimized for fast upload • Max {maxImages} images
                </p>
              </div>
              {!isDragging && !uploading && (
                <Button
                  type="button"
                  size="sm"
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

      {uploadProgress.length > 0 && (
        <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
          <p className="text-sm font-medium">Uploading {uploadProgress.length} file(s)...</p>
          <div className="space-y-2">
            {uploadProgress.map((item, index) => (
              <div key={index} className="flex items-center gap-3 text-sm">
                {getStatusIcon(item.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="truncate text-xs max-w-[150px]">{item.file}</span>
                    <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">{getStatusText(item)}</span>
                  </div>
                  <Progress value={item.progress} className="h-1.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">
            Uploaded ({images.length}/{maxImages})
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((url, index) => (
              <div key={index} className="relative group aspect-square">
                <Card className="overflow-hidden h-full">
                  <img
                    src={url}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-full object-cover"
                    data-testid={`image-preview-${index}`}
                  />
                </Card>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeImage(index)}
                  data-testid={`button-remove-image-${index}`}
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
