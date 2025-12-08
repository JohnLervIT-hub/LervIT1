import { AlertCircle } from 'lucide-react';

interface FormFieldErrorProps {
  id?: string;
  message?: string;
  className?: string;
}

export function FormFieldError({ id, message, className = '' }: FormFieldErrorProps) {
  if (!message) return null;

  return (
    <p 
      id={id} 
      className={`flex items-center gap-1.5 text-sm text-destructive mt-1.5 ${className}`} 
      role="alert"
      aria-live="polite"
    >
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

export default FormFieldError;
