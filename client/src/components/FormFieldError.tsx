import { AlertCircle } from 'lucide-react';

interface FormFieldErrorProps {
  message?: string;
  className?: string;
}

export function FormFieldError({ message, className = '' }: FormFieldErrorProps) {
  if (!message) return null;

  return (
    <p className={`flex items-center gap-1.5 text-sm text-destructive mt-1.5 ${className}`} role="alert">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{message}</span>
    </p>
  );
}

export default FormFieldError;
