import { Phone } from 'lucide-react';
import { useVoice } from '@/contexts/VoiceContext';

interface ClickToCallProps {
  phone: string;
  label?: string;
  showIcon?: boolean;
}

const normalizeForDial = (phone: string): string => {
  const digits = phone.replace(/[^\d+]/g, '');
  if (/^\d{10}$/.test(digits)) return '+1' + digits;
  if (/^\d{11,}$/.test(digits)) return '+' + digits;
  return digits;
};

export function ClickToCall({
  phone, label, showIcon = true
}: ClickToCallProps) {
  const { setDialpadNumber } = useVoice();

  if (!phone) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDialpadNumber(normalizeForDial(phone));
  };

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1
                 text-blue-600 hover:text-blue-800
                 hover:underline cursor-pointer
                 transition-colors text-sm"
      title={`Call ${phone}`}
    >
      {showIcon && <Phone className="w-3 h-3 flex-shrink-0" />}
      <span>{label || phone}</span>
    </button>
  );
}
