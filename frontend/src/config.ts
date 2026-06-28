export const getBackendUrl = (): string => {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) {
    return process.env.NEXT_PUBLIC_BACKEND_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:5001`;
  }
  return 'http://localhost:5001';
};

export const safeGetUserMedia = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
  if (typeof window === 'undefined') {
    throw new Error('Not running in browser context.');
  }
  if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('SECURE_CONTEXT_REQUIRED');
  }
  return await navigator.mediaDevices.getUserMedia(constraints);
};
