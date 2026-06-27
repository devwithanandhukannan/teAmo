'use client';
 
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Compass, Loader2, Sparkles, Navigation, ShieldCheck, Heart, UserPlus, Check, X } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useToast } from '../../components/Toast';
 
interface NearbyUser {
  userId: string;
  avatarUrl: string;
  username: string;
  distance: string;
}
 
export default function NearbyPage() {
  const router = useRouter();
  const { socket, fetchFriends, friends } = useSocket();
  const { showToast } = useToast();

  const [scanning, setScanning] = useState(false);
  const [coords, setCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [error, setError] = useState('');
  const [distanceRadius, setDistanceRadius] = useState(50);
  const [selectedUser, setSelectedUser] = useState<NearbyUser | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectedUserIds, setConnectedUserIds] = useState<string[]>([]);
  const [requestingUserIds, setRequestingUserIds] = useState<string[]>([]);
 
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  // Sync connected friends
  useEffect(() => {
    if (friends && friends.length > 0) {
      setConnectedUserIds(friends.map(f => f._id));
    }
  }, [friends]);

  // Listen to socket events for request confirmations
  useEffect(() => {
    if (!socket) return;

    const handleRequestAccepted = ({ toUserId }: { toUserId: string }) => {
      setRequestingUserIds(prev => prev.filter(id => id !== toUserId));
      setConnectedUserIds(prev => [...prev, toUserId]);
      showToast('Connection request accepted!');
      fetchFriends();
    };

    const handleRequestDenied = ({ toUserId }: { toUserId: string }) => {
      setRequestingUserIds(prev => prev.filter(id => id !== toUserId));
      showToast('Connection request declined.');
    };

    socket.on('nearby_request_accepted', handleRequestAccepted);
    socket.on('nearby_request_denied', handleRequestDenied);

    return () => {
      socket.off('nearby_request_accepted', handleRequestAccepted);
      socket.off('nearby_request_denied', handleRequestDenied);
    };
  }, [socket]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (!token || !userStr) {
      router.push('/login');
      return;
    }
    
    const user = JSON.parse(userStr);
    if (user.username === 'admin') {
      router.push('/admin');
      return;
    }
  }, []);

  const triggerNearbyScan = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setScanning(true);
    setError('');
    setNearbyUsers([]);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lng = position.coords.longitude;
        const lat = position.coords.latitude;
        setCoords({ lng, lat });

        const token = localStorage.getItem('token');
        try {
          const res = await fetch(`${backendUrl}/api/friends/scan`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ longitude: lng, latitude: lat, radius: distanceRadius })
          });
          const data = await res.json();
          if (data.success) {
            setNearbyUsers(data.nearbyUsers || []);
          } else {
            setError(data.message || 'Scan failed.');
          }
        } catch (err) {
          console.error(err);
          setError('Failed to contact nearby services.');
        } finally {
          // Delay briefly to allow scanning animation effect to complete
          setTimeout(() => {
            setScanning(false);
          }, 1500);
        }
      },
      (err) => {
        console.error(err);
        setError('Location permission denied. Please allow location access to scan.');
        setScanning(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConnectUser = () => {
    if (!selectedUser || !socket) return;
    socket.emit('nearby_request', { toUserId: selectedUser.userId });
    setRequestingUserIds(prev => [...prev, selectedUser.userId]);
    showToast('Connection request sent!');
  };

  const handleCancelRequest = () => {
    if (!selectedUser || !socket) return;
    socket.emit('nearby_request_cancel', { toUserId: selectedUser.userId });
    setRequestingUserIds(prev => prev.filter(id => id !== selectedUser.userId));
    showToast('Connection request cancelled.');
  };

  return (
    <div className="min-h-screen pt-24 pb-8 px-4 flex flex-col items-center bg-[#030712] relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-500/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-4xl flex flex-col gap-6 flex-1 justify-center items-center">
        
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            <Compass size={24} className="text-indigo-400" /> Nearby Connections
          </h2>
          <p className="text-xs text-gray-400 mt-2">
            Scan your geographic area to find other online matches looking for companions.
          </p>
        </div>

        {error && (
          <div className="w-full max-w-sm px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold text-center">
            {error}
          </div>
        )}

        {/* RADAR INTERACTION INTERFACE */}
        <div className="relative h-64 w-64 md:h-80 md:w-80 rounded-full bg-gray-950/40 border border-gray-800 flex items-center justify-center overflow-hidden shadow-2xl">
          {/* Radar background grid rings */}
          <div className="absolute inset-8 rounded-full border border-gray-800/60"></div>
          <div className="absolute inset-16 rounded-full border border-gray-800/40"></div>
          <div className="absolute inset-28 rounded-full border border-gray-800/20"></div>

          {/* Scanning sweep hand */}
          {scanning && (
            <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/0 via-indigo-500/0 to-indigo-500/25 origin-center animate-spin" style={{ animationDuration: '4s' }} />
          )}

          {/* User dots mapped onto radar */}
          {nearbyUsers.map((user, idx) => {
            // Distribute items geometrically around the circle
            const angle = (idx * (360 / Math.max(nearbyUsers.length, 1)) * Math.PI) / 180;
            const distancePercent = 30 + Math.min(idx * 15, 60); // distribute spacing
            const top = 50 + Math.sin(angle) * distancePercent * 0.45;
            const left = 50 + Math.cos(angle) * distancePercent * 0.45;

            return (
              <div
                key={user.userId}
                style={{ top: `${top}%`, left: `${left}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 group z-10"
              >
                <div className="relative">
                  <div 
                    onClick={() => setSelectedUser(user)}
                    className={`h-10 w-10 rounded-full p-[2px] border overflow-hidden cursor-pointer hover:scale-110 transition shadow-lg ${
                      selectedUser?.userId === user.userId ? 'bg-pink-500 border-white animate-pulse' : 'bg-indigo-500 border-gray-900'
                    }`}
                  >
                    <img src={user.avatarUrl} alt="Avatar" className="h-full w-full rounded-full object-cover bg-gray-950" />
                  </div>
                  <span className="absolute bottom-[-16px] left-1/2 -translate-x-1/2 bg-black/85 text-[8px] font-bold text-gray-300 border border-gray-800 px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition">
                    {user.username} ({user.distance})
                  </span>
                </div>
              </div>
            );
          })}

          {/* Local Center Node */}
          <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center glow-primary z-20 border-2 border-white/10">
            <Navigation size={18} className="text-white fill-white rotate-45" />
          </div>
        </div>

        {/* Custom distance slider */}
        <div className="w-full max-w-sm flex flex-col gap-2 bg-gray-950/40 border border-gray-800 p-4 rounded-2xl">
          <div className="flex justify-between items-center text-xs font-bold text-gray-300">
            <span>Scan Proximity Limit</span>
            <span className="text-indigo-400 font-mono">{distanceRadius} km</span>
          </div>
          <input
            type="range"
            min="1"
            max="200"
            value={distanceRadius}
            onChange={(e) => {
              setDistanceRadius(parseInt(e.target.value));
              setSelectedUser(null);
            }}
            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span className="text-[9px] text-gray-500">Find active users within the selected distance boundary.</span>
        </div>

        {/* Selected User connection popover */}
        {selectedUser && (
          <div className="w-full max-w-sm bg-gray-950/90 border border-indigo-500/25 p-4 rounded-2xl flex items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom duration-300 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <img src={selectedUser.avatarUrl} alt="Avatar" className="h-10 w-10 rounded-full border border-white/10 bg-gray-900 object-cover" />
              <div>
                <h4 className="text-xs font-bold text-white uppercase">{selectedUser.username}</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Proximity: {selectedUser.distance}</p>
              </div>
            </div>
            
            <div className="flex gap-2 items-center">
              {connectedUserIds.includes(selectedUser.userId) ? (
                <span className="px-3.5 py-2 bg-green-500/10 border border-green-500/25 text-green-400 rounded-xl text-[10px] font-bold flex items-center gap-1">
                  <Check size={10} /> Connected
                </span>
              ) : requestingUserIds.includes(selectedUser.userId) ? (
                <div className="flex gap-1.5 items-center">
                  <span className="px-2.5 py-2 bg-white/5 border border-white/5 text-gray-400 rounded-xl text-[9px] font-bold animate-pulse">
                    Requesting...
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelRequest}
                    className="px-2.5 py-2 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 rounded-xl text-[9px] font-black transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectUser}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black transition flex items-center gap-1"
                >
                  <UserPlus size={10} /> Connect
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-xl transition"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        <button
          onClick={triggerNearbyScan}
          disabled={scanning}
          className="px-8 py-3.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-2xl font-bold text-xs shadow-lg hover:shadow-indigo-500/20 transition transform hover:scale-105 flex items-center gap-2"
        >
          {scanning ? (
            <>
              <Loader2 className="animate-spin" size={14} /> Scanning Local Area...
            </>
          ) : (
            <>
              Start Scan <Compass size={14} />
            </>
          )}
        </button>

        {/* Security Warning banner */}
        <div className="flex items-center gap-2 bg-gray-950/60 p-4 rounded-xl border border-gray-800 max-w-sm mt-4 text-[10px] text-gray-500">
          <ShieldCheck size={18} className="text-indigo-400 shrink-0" />
          <span>
            <strong>Location Security Shield:</strong> We do not expose your exact coordinates to peers. Only relative distances and avatar profile displays are visible.
          </span>
        </div>

      </div>
    </div>
  );
}
