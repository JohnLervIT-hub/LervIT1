import { useEffect, useRef, useState, useCallback, Component, type ReactNode } from 'react';
import { useMoverWebSocket } from '@/hooks/useMoverWebSocket';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import { Bell, BellRing, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';

interface JobNotification {
  type: string;
  bookingId?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  price?: string;
  estimatedTime?: string;
  expiresAt?: string;
  timestamp?: string;
}

class NotificationErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {}
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function JobNotificationSoundContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showNotificationDialog, setShowNotificationDialog] = useState(false);
  const [currentNotification, setCurrentNotification] = useState<JobNotification | null>(null);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Only enable for movers
  const isMover = user?.role === 'mover';

  // Check notification permission
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  }, []);

  // Reusable AudioContext reference
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play notification sound - reuses single AudioContext to prevent memory leaks
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return;
    
    // Create or reuse AudioContext
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const audioContext = audioContextRef.current;
    
    // Resume context if suspended (browsers require user interaction)
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    // Create notification beep sequence
    const createBeep = (frequency: number, startTime: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    const now = audioContext.currentTime;
    // Play a pleasant triple-beep notification (similar to Uber)
    createBeep(880, now, 0.15);        // A5
    createBeep(1047, now + 0.2, 0.15); // C6
    createBeep(1319, now + 0.4, 0.25); // E6
    
    // Repeat after a short pause using same context
    setTimeout(() => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        const now2 = audioContextRef.current.currentTime;
        createBeep(880, now2, 0.15);
        createBeep(1047, now2 + 0.2, 0.15);
        createBeep(1319, now2 + 0.4, 0.25);
      }
    }, 800);
  }, [soundEnabled]);
  
  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Show browser notification
  const showBrowserNotification = useCallback((notification: JobNotification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const browserNotif = new Notification('New Job Available!', {
        body: `Pickup: ${notification.pickupAddress}\nEarnings: $${notification.price}`,
        icon: '/favicon.ico',
        tag: notification.bookingId,
        requireInteraction: true,
      });
      
      browserNotif.onclick = () => {
        window.focus();
        setShowNotificationDialog(true);
        browserNotif.close();
      };
    }
  }, []);

  // Handle incoming job notification
  const handleJobNotification = useCallback((notification: JobNotification) => {
    console.log('[Notification] Received job notification:', notification);
    
    // Play sound
    playNotificationSound();
    
    // Store current notification
    setCurrentNotification(notification);
    setHasNewNotification(true);
    
    // Show dialog
    setShowNotificationDialog(true);
    
    // Show browser notification
    showBrowserNotification(notification);
    
    // Show toast
    toast({
      title: "New Job Available!",
      description: `Earn $${notification.price} - tap to view details`,
      duration: 10000,
    });
    
    // Refresh job notifications query
    queryClient.invalidateQueries({ queryKey: ['/api/movers/me/notifications'] });
  }, [playNotificationSound, showBrowserNotification, toast]);

  // Connect to WebSocket
  const { isConnected } = useMoverWebSocket({
    onJobNotification: handleJobNotification,
    enabled: isMover,
  });

  // Request permission on first interaction
  useEffect(() => {
    const handleFirstInteraction = () => {
      requestNotificationPermission();
      document.removeEventListener('click', handleFirstInteraction);
    };
    
    if (isMover && notificationPermission === 'default') {
      document.addEventListener('click', handleFirstInteraction);
      return () => document.removeEventListener('click', handleFirstInteraction);
    }
  }, [isMover, notificationPermission, requestNotificationPermission]);

  if (!isMover) return null;

  return (
    <>
      {/* Notification Status Indicator */}
      <div className="fixed bottom-20 right-4 z-40 flex items-center gap-2 md:bottom-4">
        {/* Sound Toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`rounded-full shadow-lg ${soundEnabled ? 'bg-green-50 border-green-200' : 'bg-gray-100'}`}
          data-testid="button-toggle-sound"
        >
          {soundEnabled ? (
            <Volume2 className="h-4 w-4 text-green-600" />
          ) : (
            <VolumeX className="h-4 w-4 text-gray-500" />
          )}
        </Button>

        {/* Connection Status */}
        <div 
          className={`flex items-center gap-2 px-3 py-2 rounded-full shadow-lg ${
            isConnected ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
          }`}
        >
          {hasNewNotification ? (
            <BellRing className={`h-4 w-4 ${isConnected ? 'text-green-600' : 'text-amber-600'} animate-pulse`} />
          ) : (
            <Bell className={`h-4 w-4 ${isConnected ? 'text-green-600' : 'text-amber-600'}`} />
          )}
          <span className={`text-xs font-medium ${isConnected ? 'text-green-700' : 'text-amber-700'}`}>
            {isConnected ? 'Live' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Notification Dialog */}
      <Dialog open={showNotificationDialog} onOpenChange={(open) => {
        setShowNotificationDialog(open);
        if (!open) setHasNewNotification(false);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-orange-500 animate-pulse" />
              New Job Available!
            </DialogTitle>
            <DialogDescription>
              A customer needs your help. Accept quickly before it expires!
            </DialogDescription>
          </DialogHeader>

          {currentNotification && (
            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">Job Details</CardTitle>
                  {currentNotification.expiresAt && (
                    <Badge variant="destructive" className="text-xs">
                      Expires {formatDistanceToNow(new Date(currentNotification.expiresAt), { addSuffix: true })}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Pickup</p>
                  <p className="font-medium">{currentNotification.pickupAddress || 'Address pending'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Drop-off</p>
                  <p className="font-medium">{currentNotification.dropoffAddress || 'Address pending'}</p>
                </div>
                {currentNotification.estimatedTime && (
                  <div>
                    <p className="text-sm text-muted-foreground">Distance</p>
                    <p className="font-medium">{currentNotification.estimatedTime}</p>
                  </div>
                )}
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">Your Earnings</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${parseFloat(currentNotification.price || '0').toFixed(2)}
                  </p>
                </div>
                
                <div className="flex gap-2 pt-2">
                  <Button 
                    className="flex-1 bg-orange-500 hover:bg-orange-600"
                    onClick={() => {
                      setShowNotificationDialog(false);
                      setHasNewNotification(false);
                      // Navigate to notifications page or accept directly
                      window.location.href = '/mover/dashboard';
                    }}
                    data-testid="button-view-job"
                  >
                    View & Accept
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      setShowNotificationDialog(false);
                      setHasNewNotification(false);
                    }}
                    data-testid="button-dismiss-notification"
                  >
                    Later
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function JobNotificationSound() {
  return (
    <NotificationErrorBoundary>
      <JobNotificationSoundContent />
    </NotificationErrorBoundary>
  );
}
