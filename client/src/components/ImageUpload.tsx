import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, X, Camera, CheckCircle, Loader2, ImagePlus, AlertCircle } from "lucide-react";
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
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isUploading = uploadProgress.some(p => p.status === 'compressing' || p.status === 'uploading');

  const isHeicFile = (file: File): boolean => {
    const ext = file.name.toLowerCase().split('.').pop();
    return ext === 'heic' || ext === 'heif' || file.type.includes('heic') || file.type.includes('heif');
  };

  const needsCompression = (file: File): boolean => {
    return file.size > 1.5 * 1024 * 1024 || isHeicFile(file);
  };

  const compressImage = async (file: File): Promise<File> => {
    if (!needsCompression(file)) {
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
      const compressedFile = await imageCompression(file, options);
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
    limit: number,
    startIndex: number
  ): Promise<(string | null)[]> => {
    const results: (string | null)[] = new Array(files.length).fill(null);
    let currentFileIndex = 0;
    
    const worker = async () => {
      while (currentFileIndex < files.length) {
        const fileIndex = currentFileIndex++;
        const globalIndex = startIndex + fileIndex;
        results[fileIndex] = await uploadSingleFile(files[fileIndex], globalIndex);
      }
    };

    const workers = Array(Math.min(limit, files.length)).fill(null).map(() => worker());
    await Promise.all(workers);
    
    return results;
  };

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

    const startIndex = uploadProgress.length;
    const newProgress = validFiles.map(f => ({ 
      file: f.name, 
      progress: 0, 
      status: 'compressing' as const 
    }));
    setUploadProgress(prev => [...prev, ...newProgress]);

    try {
      const results = await uploadWithConcurrencyLimit(validFiles, MAX_CONCURRENT_UPLOADS, startIndex);
      
      const successfulUrls = results.filter((url): url is string => url !== null);

      if (successfulUrls.length > 0) {
        const newImages = [...images, ...successfulUrls];
        setImages(newImages);
        onImagesChange(newImages);

        if (onAnalyze) {
          onAnalyze(newImages);
        }
      }

      setTimeout(() => {
        setUploadProgress(prev => prev.filter(p => p.status !== 'done'));
      }, 2000);
    } catch (error) {
      console.error('[ImageUpload] Upload error:', error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload images.",
        variant: "destructive",
      });
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

    if (images.length >= maxImages) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await uploadFiles(files);
    }
  }, [images.length, maxImages]);

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    onImagesChange(newImages);
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
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
        return <AlertCircle className="w-3 h-3 text-red-500" />;
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

  const activeUploads = uploadProgress.filter(p => p.status === 'compressing' || p.status === 'uploading');
  const hasImages = images.length > 0;

  return (
    <Card className="overflow-visible">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-sm">Upload Photos</h3>
              <p className="text-xs text-muted-foreground">Take or upload photos of your items</p>
            </div>
          </div>
          {hasImages && (
            <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
              {images.length}/{maxImages}
            </span>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={`relative cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-all duration-200 ${
            isDragging 
              ? 'border-primary bg-primary/5 shadow-md' 
              : 'border-muted-foreground/20 hover:border-primary/40 hover:bg-muted/20'
          } ${images.length >= maxImages ? 'opacity-50 cursor-not-allowed' : ''}`}
          data-testid="dropzone-upload"
        >
          <div className="flex flex-col items-center gap-2">
            <div className={`p-2.5 rounded-full transition-colors ${isDragging ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
              {isDragging ? <Upload className="w-5 h-5" /> : <ImagePlus className="w-5 h-5" />}
            </div>
            <div>
              <p className="font-medium text-sm">
                {isDragging ? 'Drop photos here' : 'Add Photos'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isDragging ? 'Release to upload' : 'Drag & drop or tap to select'}
              </p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={images.length >= maxImages}
            data-testid="input-image-upload"
          />
        </div>

        {!hasImages && (
          <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              <span className="font-medium">Required:</span> Please upload at least 1 photo of your items
            </p>
          </div>
        )}

        {activeUploads.length > 0 && (
          <div className="space-y-1.5 p-2 bg-muted/30 rounded-lg text-xs">
            {activeUploads.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                {getStatusIcon(item.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="truncate max-w-[120px] text-muted-foreground">{item.file}</span>
                    <span className="text-muted-foreground ml-2 flex-shrink-0">{getStatusText(item)}</span>
                  </div>
                  <Progress value={item.progress} className="h-1" />
                </div>
              </div>
            ))}
          </div>
        )}

        {hasImages && (
          <div className="grid grid-cols-4 gap-2">
            {images.map((url, index) => (
              <div key={index} className="relative group aspect-square">
                <div className="overflow-hidden rounded-md h-full border bg-muted">
                  <img
                    src={url}
                    alt={`Item ${index + 1}`}
                    className="w-full h-full object-cover"
                    data-testid={`image-preview-${index}`}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(index);
                  }}
                  data-testid={`button-remove-image-${index}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {images.length < maxImages && (
              <div
                onClick={triggerFileInput}
                className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/20 flex items-center justify-center cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors"
                data-testid="button-add-more-images"
              >
                <ImagePlus className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
