import React, { useState, useEffect, useRef } from 'react';
import { PANDIT_CONTACTS } from './constants';
import { Contact, ClientEntry, ViewState, BackgroundImage } from './types';
import { generateRitualPlan, findMatchingFace } from './services/geminiService';
import { dbService } from './services/db';
import SignaturePad from './components/SignaturePad';
import CameraCapture from './components/CameraCapture';
import { 
  HomeIcon, PlusIcon, ClipboardIcon, PhoneIcon, SparklesIcon, 
  ImagePlusIcon, PrintIcon, DownloadIcon, CameraIcon, FaceScanIcon, 
  CheckIcon, SearchIcon, CalendarIcon, RefreshCcwIcon, TrashIcon, 
  XIcon, AlertTriangleIcon, LockIcon, LogOutIcon, MusicIcon, VolumeXIcon,
  WhatsAppIcon
} from './components/Icons';

const QUOTES = [
  "Braj ki Raj mein hi Vaikunth hai.",
  "Radhe Radhe - The soul of Mathura.",
  "Every pebble in Braj is a deity.",
  "Service to the Yatri is service to Krishna.",
  "Blessed is the path that leads to Vrindavan."
];

// Playlist of reliable audio sources using standard redirect links.
// These links automatically find the correct server node.
const PLAYLIST = [
  // 1. Krishna Flute Music (Instrumental - Highly Reliable)
  "https://archive.org/download/KrishnaFluteMusic/Krishna%20Flute%20Music.mp3",
  // 2. Radhe Radhe Bol
  "https://archive.org/download/RadheRadheBol/Radhe%20Radhe%20Bol.mp3",
  // 3. Achyutam Keshavam
  "https://archive.org/download/AchyutamKeshavam/Achyutam%20Keshavam.mp3"
];

const isQuotaError = (e: any) => {
  return (
    e instanceof DOMException &&
    (e.code === 22 ||
      e.code === 1014 ||
      e.name === 'QuotaExceededError' ||
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
};

interface ConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  type: 'danger' | 'info';
}

const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<Contact | null>(null);
  const [loginId, setLoginId] = useState('');
  const [loginError, setLoginError] = useState('');

  const [view, setView] = useState<ViewState>('login');
  const [entries, setEntries] = useState<ClientEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [quote, setQuote] = useState("");
  
  // Audio State
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Storage & Error State
  const [confirmState, setConfirmState] = useState<ConfirmationState | null>(null);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [failedEntry, setFailedEntry] = useState<ClientEntry | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    servicePlan: '',
    paymentDetails: ''
  });
  const [ritualPlan, setRitualPlan] = useState('');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [activeCameraField, setActiveCameraField] = useState<'client' | 'face_search' | 'pandit_photo' | null>(null);
  
  // Pandit Photo & Profile State
  const [panditContacts, setPanditContacts] = useState<Contact[]>(PANDIT_CONTACTS);
  const [activePanditId, setActivePanditId] = useState<string | null>(null);
  const [selectedPandit, setSelectedPandit] = useState<Contact | null>(null); // For Yatri view profile

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);
  
  // Face Search State
  const [faceSearchImage, setFaceSearchImage] = useState<string | null>(null);
  const [matchedClientId, setMatchedClientId] = useState<number | null>(null);
  const [isSearchingFace, setIsSearchingFace] = useState(false);

  // Print/PDF State
  const [printEntry, setPrintEntry] = useState<ClientEntry | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Refs
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check for logged in user
    const savedPanditId = localStorage.getItem('yatra_pandit_id');
    if (savedPanditId) {
      const found = PANDIT_CONTACTS.find(p => p.panditId === savedPanditId);
      if (found) {
        setCurrentUser(found);
        setView('home');
      }
    }

    // Load Pandit Photos from LocalStorage
    const savedPhotos = localStorage.getItem('pandit_photos');
    if (savedPhotos) {
      try {
        const photosMap = JSON.parse(savedPhotos);
        setPanditContacts(prev => prev.map(p => ({
          ...p,
          photo: photosMap[p.panditId] || p.photo
        })));
      } catch (e) {
        console.error("Failed to load pandit photos", e);
      }
    }

    const loadData = async () => {
      try {
        const data = await dbService.getAllClients();
        setEntries(data);
      } catch (err) {
        console.warn("DB access error", err);
      } finally {
        setLoadingEntries(false);
      }
    };
    loadData();
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
  }, []);

  // Handle Audio Playback
  useEffect(() => {
    if (audioRef.current) {
      // Reload is needed if source changed dynamically while playing
      audioRef.current.load();
      
      if (isMusicPlaying) {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(e => {
            // Avoid logging the full event object to prevent circular structure errors
            console.log("Audio play failed (interaction usually needed):", e.message || "Playback prevented");
          });
        }
      } else {
        audioRef.current.pause();
      }
    }
  }, [isMusicPlaying, currentSongIndex]);

  const toggleMusic = () => {
    // If we were in an error state, retry from the beginning or current index
    if (audioError) {
      setAudioError(false);
      setCurrentSongIndex(0); // Retry from the first reliable song
      setIsMusicPlaying(true);
    } else {
      setIsMusicPlaying(!isMusicPlaying);
    }
  };

  const handleAudioError = (e: React.SyntheticEvent<HTMLAudioElement, Event>) => {
    const errorMsg = e.currentTarget.error ? e.currentTarget.error.message : "Unknown audio error";
    const errorCode = e.currentTarget.error ? e.currentTarget.error.code : 0;
    
    console.warn(`Audio Source Error (Code ${errorCode}):`, errorMsg);
    
    // Try next song in playlist if available
    if (currentSongIndex < PLAYLIST.length - 1) {
      console.log(`Source ${currentSongIndex} failed. Switching to source ${currentSongIndex + 1}...`);
      setCurrentSongIndex(prev => prev + 1);
    } else {
      console.error("All audio sources failed.");
      setAudioError(true);
      setIsMusicPlaying(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    const pandit = PANDIT_CONTACTS.find(p => p.panditId.toUpperCase() === loginId.toUpperCase().trim());
    
    if (pandit) {
      setCurrentUser(pandit);
      localStorage.setItem('yatra_pandit_id', pandit.panditId);
      setLoginId('');
      setView('home');
      // Auto-start music on login (user interaction allows autoplay)
      setIsMusicPlaying(true);
    } else {
      setLoginError('Invalid Pandit ID. Please contact head office.');
    }
  };

  const handleGuestAccess = () => {
    setCurrentUser(null);
    setView('home');
    setIsMusicPlaying(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('yatra_pandit_id');
    setCurrentUser(null);
    setView('login');
    setIsMusicPlaying(false);
  };

  const performSave = async () => {
    const newEntry: ClientEntry = {
      id: Date.now(),
      uniqueCode: `YM-${Date.now().toString().slice(-6)}`,
      clientName: formData.name,
      phone: formData.phone,
      address: formData.address,
      servicePlan: formData.servicePlan + (ritualPlan ? `\n\nSPIRITUAL PLAN:\n${ritualPlan}` : ''),
      paymentDetails: formData.paymentDetails,
      clientPhoto: capturedPhoto || undefined,
      signatureImage: signature,
      timestamp: Date.now(),
    };

    try {
      await dbService.saveClient(newEntry);
      setEntries([newEntry, ...entries]);
      resetForm();
      setView('home');
    } catch (err) {
      if (isQuotaError(err)) {
        setFailedEntry(newEntry);
        setShowStorageModal(true);
      } else {
        alert("Failed to save. Storage might be full.");
      }
    }
  };

  const handleSaveEntry = async () => {
    if (!formData.name) return alert("Yatri Name is required");

    if (!capturedPhoto) {
      setConfirmState({
        isOpen: true,
        title: "No Photo Captured",
        message: "You haven't taken a photo of the Yatri. It is recommended for records. Do you want to save without it?",
        type: 'info',
        onConfirm: () => {
          performSave();
          setConfirmState(null);
        }
      });
      return;
    }

    await performSave();
  };

  const handlePanditPhotoCapture = (img: string) => {
    if (!activePanditId) return;
    
    const updatedPandits = panditContacts.map(p => 
      p.panditId === activePanditId ? { ...p, photo: img } : p
    );
    setPanditContacts(updatedPandits);
    
    // Persist
    const photosToSave = updatedPandits.reduce((acc, p) => {
      if (p.photo) acc[p.panditId] = p.photo;
      return acc;
    }, {} as Record<string, string>);
    localStorage.setItem('pandit_photos', JSON.stringify(photosToSave));
    
    setActiveCameraField(null);
    setActivePanditId(null);
  };

  const handleGeneratePlan = async () => {
    if (!formData.servicePlan) return;
    setIsGeneratingPlan(true);
    const plan = await generateRitualPlan(formData.servicePlan);
    setRitualPlan(plan);
    setIsGeneratingPlan(false);
  };

  const handleFaceSearch = async (imageData: string) => {
    setFaceSearchImage(imageData);
    setActiveCameraField(null);
    setIsSearchingFace(true);
    setMatchedClientId(null);

    const matchId = await findMatchingFace(imageData, entries.map(e => ({
      id: e.id,
      name: e.clientName,
      photo: e.clientPhoto || ''
    })).filter(e => e.photo));

    setMatchedClientId(matchId);
    setIsSearchingFace(false);
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', address: '', servicePlan: '', paymentDetails: '' });
    setRitualPlan('');
    setCapturedPhoto(null);
    setSignature(null);
    setActiveCameraField(null);
  };

  const handleDeleteEntry = (id: number) => {
    setConfirmState({
      isOpen: true,
      title: "Delete Record",
      message: "Are you sure? This pilgrim record will be permanently removed.",
      type: 'danger',
      onConfirm: async () => {
        await dbService.deleteClient(id);
        setEntries(entries.filter(e => e.id !== id));
        setConfirmState(null);
      }
    });
  };

  const handleDownloadPdf = () => {
    if (!printRef.current) return;
    setIsGeneratingPdf(true);
    const opt = {
      margin: 0.2,
      filename: `Yatra_Receipt_${printEntry?.uniqueCode}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    // @ts-ignore
    window.html2pdf().set(opt).from(printRef.current).save().then(() => setIsGeneratingPdf(false));
  };

  // --- Filter Logic ---
  const filteredEntries = entries.filter(e => {
    const matchesSearch = 
      e.clientName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.phone.includes(searchQuery) || 
      e.uniqueCode.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (dateFilter.start) {
      const [y, m, d] = dateFilter.start.split('-').map(Number);
      const startDate = new Date(y, m - 1, d);
      if (e.timestamp < startDate.getTime()) return false;
    }

    if (dateFilter.end) {
      const [y, m, d] = dateFilter.end.split('-').map(Number);
      const endDate = new Date(y, m - 1, d, 23, 59, 59, 999);
      if (e.timestamp > endDate.getTime()) return false;
    }
    
    return true;
  });

  // --- Views ---

  // Login View
  if (view === 'login' && !currentUser) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 bg-slate-50 relative overflow-hidden">
        {/* Background Audio */}
        <audio 
          ref={audioRef} 
          loop 
          src={PLAYLIST[currentSongIndex]} 
          onError={handleAudioError}
        />

        {/* Background Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
           <p className="text-[20vw] font-bold text-orange-500/5 -rotate-12 divine-font whitespace-nowrap select-none">
             Radhe Radhe
           </p>
        </div>

        {/* Login Music Control */}
        <div className="absolute top-6 right-6 z-20">
           <button 
              onClick={toggleMusic} 
              className={`p-3 rounded-full transition shadow-lg ${isMusicPlaying ? 'bg-orange-500 text-white' : 'bg-white text-slate-400'}`}
              title={audioError ? "Music Unavailable" : (isMusicPlaying ? "Mute Music" : "Play Radhe Radhe")}
            >
              {isMusicPlaying ? <MusicIcon className="w-6 h-6 animate-pulse" /> : <VolumeXIcon className="w-6 h-6" />}
            </button>
            {audioError && <p className="text-red-500 text-[10px] font-bold mt-1 bg-white/80 px-2 py-1 rounded">Music unavailable</p>}
        </div>

        <div className="relative z-10 w-full max-w-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl p-8 border border-slate-100">
             <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center text-4xl text-orange-600 mx-auto mb-6 shadow-inner animate-pulse">
               ॐ
             </div>
             
             <div className="text-center mb-6">
               <h1 className="text-2xl font-bold divine-font text-slate-800">Yatra To Mathura</h1>
               <p className="text-sm text-slate-400 mt-1">Welcome to Braj</p>
             </div>

             {/* Guest Access Button */}
             <button 
                type="button"
                onClick={handleGuestAccess}
                className="w-full py-4 bg-orange-600 text-white font-bold rounded-2xl shadow-lg shadow-orange-200 hover:bg-orange-700 transition active:scale-95 divine-font tracking-wide mb-8 text-lg"
              >
                ENTER AS YATRI
             </button>

             {/* Divider */}
             <div className="relative flex items-center mb-8">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-xs font-bold text-slate-300 uppercase tracking-widest">Pandit Access</span>
                <div className="flex-grow border-t border-slate-200"></div>
             </div>

             <form onSubmit={handleLogin} className="space-y-4">
               <div className="relative">
                 <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                 <input 
                   type="text" 
                   value={loginId}
                   onChange={(e) => setLoginId(e.target.value)}
                   placeholder="Enter Pandit ID"
                   className="w-full p-3 pl-12 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition font-bold text-center tracking-widest uppercase text-sm text-indigo-900"
                 />
               </div>
               
               {loginError && (
                 <p className="text-red-500 text-xs text-center font-bold animate-in fade-in">{loginError}</p>
               )}

               <button 
                 type="submit"
                 className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-xl hover:bg-slate-200 transition active:scale-95 text-xs tracking-wide"
               >
                 LOGIN AS PANDIT
               </button>
             </form>
          </div>
        </div>
      </div>
    );
  }

  // Camera Views (Full Screen)
  if (activeCameraField === 'client') {
    return (
      <div className="h-screen bg-black flex flex-col">
        <CameraCapture onCapture={(img) => { setCapturedPhoto(img); setActiveCameraField(null); }} label="Registering Yatri" />
        <button onClick={() => setActiveCameraField(null)} className="absolute top-6 left-6 text-white bg-black/50 p-3 rounded-full">
           <XIcon className="w-6 h-6" />
        </button>
      </div>
    );
  }

  if (activeCameraField === 'face_search') {
    return (
      <div className="h-screen bg-black flex flex-col">
        <CameraCapture onCapture={handleFaceSearch} label="Scanning for Yatri" />
        <button onClick={() => setActiveCameraField(null)} className="absolute top-6 left-6 text-white bg-black/50 p-3 rounded-full">
           <XIcon className="w-6 h-6" />
        </button>
      </div>
    );
  }

  if (activeCameraField === 'pandit_photo') {
    return (
      <div className="h-screen bg-black flex flex-col">
        <CameraCapture onCapture={handlePanditPhotoCapture} label="Updating Pandit Photo" />
        <button onClick={() => { setActiveCameraField(null); setActivePanditId(null); }} className="absolute top-6 left-6 text-white bg-black/50 p-3 rounded-full">
           <XIcon className="w-6 h-6" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden relative">
      {/* Background Audio */}
      <audio 
        ref={audioRef} 
        loop 
        src={PLAYLIST[currentSongIndex]} 
        onError={handleAudioError} 
      />

      {/* Global App Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
         <p className="text-[15vw] font-bold text-orange-500/5 -rotate-12 divine-font whitespace-nowrap select-none">
           Radhe Radhe
         </p>
      </div>

      {/* Modals */}
      
      {/* Pandit Profile Modal */}
      {selectedPandit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden relative scale-100 animate-in zoom-in-95">
             <button 
               onClick={() => setSelectedPandit(null)}
               className="absolute top-4 right-4 z-20 bg-black/20 hover:bg-black/40 text-white p-2 rounded-full transition"
             >
               <XIcon className="w-6 h-6" />
             </button>

             {/* Header Image */}
             <div className="h-48 bg-gradient-to-br from-orange-400 to-red-600 relative flex items-end justify-center pb-0">
                <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                <div className="translate-y-12">
                   {selectedPandit.photo ? (
                      <img src={selectedPandit.photo} className="w-32 h-32 rounded-full border-4 border-white shadow-xl object-cover" />
                   ) : (
                      <div className={`w-32 h-32 rounded-full border-4 border-white shadow-xl flex items-center justify-center text-4xl font-bold divine-font ${selectedPandit.colorClass}`}>
                        {selectedPandit.initial}
                      </div>
                   )}
                </div>
             </div>

             {/* Content */}
             <div className="pt-14 pb-8 px-6 text-center space-y-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 divine-font">{selectedPandit.name}</h2>
                  <p className="text-orange-600 font-bold uppercase tracking-widest text-xs mt-1">{selectedPandit.role}</p>
                </div>

                {selectedPandit.sloka && (
                  <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 my-4">
                    <p className="text-orange-800 font-bold divine-font text-lg leading-relaxed italic">
                      {selectedPandit.sloka.sanskrit}
                    </p>
                    <p className="text-orange-600/70 text-xs mt-2 font-medium">
                      "{selectedPandit.sloka.meaning}"
                    </p>
                  </div>
                )}

                {selectedPandit.bio && (
                  <p className="text-slate-600 text-sm leading-relaxed text-justify px-2">
                    {selectedPandit.bio}
                  </p>
                )}

                <div className="flex gap-3 pt-4">
                  <a 
                    href={`https://wa.me/91${selectedPandit.phone}?text=Radhe%20Radhe%20Pandit%20Ji,%20I%20would%20like%20to%20know%20more%20about%20the%20Yatra.`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex-1 py-3 bg-green-500 text-white rounded-xl font-bold shadow-lg hover:bg-green-600 transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    <WhatsAppIcon className="w-5 h-5" /> Chat
                  </a>
                  <a 
                    href={`tel:${selectedPandit.phone}`} 
                    className="flex-1 py-3 bg-indigo-500 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-600 transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    <PhoneIcon className="w-5 h-5" /> Call
                  </a>
                </div>
             </div>
          </div>
        </div>
      )}

      {showStorageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-orange-500 p-4 flex items-center gap-3">
              <AlertTriangleIcon className="text-white w-6 h-6" />
              <h3 className="font-bold text-white divine-font">Storage Warning</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-slate-600">Your digital register is getting full. Please free up some space by removing older records.</p>
              <button onClick={() => setShowStorageModal(false)} className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-xl">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {confirmState && confirmState.isOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden scale-100 animate-in zoom-in-95">
            <div className={`p-4 flex items-center gap-3 ${confirmState.type === 'danger' ? 'bg-red-500' : 'bg-orange-500'}`}>
              <AlertTriangleIcon className="text-white w-6 h-6" />
              <h3 className="font-bold text-white divine-font">{confirmState.title}</h3>
            </div>
            <div className="p-6 space-y-6">
              <p className="text-slate-600 leading-relaxed">{confirmState.message}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmState(null)} 
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmState.onConfirm} 
                  className={`flex-1 py-3 text-white font-bold rounded-xl shadow-lg transition active:scale-95 ${confirmState.type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {printEntry && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col backdrop-blur-sm">
          <div className="bg-indigo-900 text-white p-4 flex justify-between items-center shadow-lg">
            <h3 className="font-bold divine-font text-xl">Digital Receipt</h3>
            <div className="flex gap-2">
              <button onClick={handleDownloadPdf} className="bg-white/10 p-2 rounded-lg hover:bg-white/20 transition">
                {isGeneratingPdf ? <RefreshCcwIcon className="animate-spin w-5 h-5" /> : <DownloadIcon className="w-5 h-5" />}
              </button>
              <button onClick={() => setPrintEntry(null)} className="bg-white/10 p-2 rounded-lg hover:bg-white/20">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 md:p-8 flex justify-center">
            <div ref={printRef} id="print-preview-content" className="bg-white w-full max-w-[210mm] shadow-2xl p-8 md:p-12 text-slate-900 relative min-h-[297mm] overflow-hidden">
              
              {/* Document Watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                  <p className="text-[8rem] font-bold text-orange-500/5 -rotate-45 divine-font whitespace-nowrap select-none">
                    RADHE RADHE
                  </p>
              </div>

              <div className="relative z-10">
                <div className="text-center mb-10">
                  <h1 className="text-4xl font-bold text-orange-600 divine-font">Yatra To Mathura</h1>
                  <p className="text-indigo-900 font-bold uppercase tracking-[0.2em] text-sm mt-1">Pandit Rajendranath Chaturvedi & Sons</p>
                  <div className="w-32 h-1 bg-orange-200 mx-auto mt-4 rounded-full"></div>
                </div>
                <div className="flex justify-between items-start mb-8 border-b pb-6 border-slate-100">
                  <div className="space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase">Registration Code</p>
                    <p className="text-xl font-mono font-bold text-indigo-900">{printEntry.uniqueCode}</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className="text-xs text-slate-400 font-bold uppercase">Date</p>
                    <p className="text-lg font-bold">{new Date(printEntry.timestamp).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="col-span-2 md:col-span-1 border-l-4 border-orange-500 pl-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Pilgrim Name</h3>
                    <p className="text-2xl divine-font">{printEntry.clientName}</p>
                  </div>
                  <div className="col-span-2 md:col-span-1 border-l-4 border-indigo-500 pl-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Contact No.</h3>
                    <p className="text-xl">{printEntry.phone}</p>
                  </div>
                  <div className="col-span-2 border-l-4 border-slate-300 pl-4">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-1">Address</h3>
                    <p className="text-lg">{printEntry.address}</p>
                  </div>
                </div>
                <div className="bg-slate-50/80 rounded-2xl p-6 border border-slate-100 mb-8 backdrop-blur-sm">
                  <h4 className="text-sm font-bold text-indigo-900 mb-4 border-b border-indigo-100 pb-2">SERVICE & SPIRITUAL DETAILS</h4>
                  <div className="whitespace-pre-wrap text-slate-700 leading-relaxed italic text-sm md:text-base">
                    {printEntry.servicePlan}
                  </div>
                </div>
                <div className="flex justify-between items-end mt-12">
                  <div className="space-y-4">
                    {printEntry.clientPhoto && (
                      <div className="w-24 h-24 rounded-xl border-2 border-indigo-100 overflow-hidden shadow-md">
                        <img src={printEntry.clientPhoto} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <p className="text-xs font-bold text-slate-400">Yatri Image</p>
                  </div>
                  <div className="text-center">
                    <div className="h-16 w-48 border-b border-slate-300 flex items-end justify-center pb-1 mb-2">
                      {printEntry.signatureImage && <img src={printEntry.signatureImage} className="max-h-full" />}
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase">Yatri Signature</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="indigo-gradient text-white p-5 shadow-xl sticky top-0 z-40 relative">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl animate-pulse">
               ॐ
             </div>
             <div>
               <h1 className="text-2xl font-bold leading-none divine-font">Yatra To Mathura</h1>
               {currentUser ? (
                 <p className="text-xs text-indigo-200 uppercase tracking-widest mt-1 font-bold">
                   Welcome, Pandit {currentUser.name.split(' ')[0]}
                 </p>
               ) : (
                 <p className="text-xs text-indigo-200 uppercase tracking-widest mt-1">Welcome Yatri</p>
               )}
             </div>
          </div>
          
          <div className="flex gap-2">
            {/* Music Control Toggle */}
            <button 
              onClick={toggleMusic} 
              className={`p-3 rounded-full transition ${isMusicPlaying ? 'bg-orange-500 text-white shadow-lg' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}
              title={audioError ? "Music Unavailable" : (isMusicPlaying ? "Mute Music" : "Play Radhe Radhe")}
            >
              {isMusicPlaying ? <MusicIcon className="w-6 h-6 animate-pulse" /> : <VolumeXIcon className="w-6 h-6" />}
            </button>

            {currentUser ? (
              <button onClick={handleLogout} className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition text-red-200 hover:text-white" title="Logout">
                 <LogOutIcon className="w-6 h-6" />
              </button>
            ) : (
              <button onClick={() => setView('login')} className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition text-slate-300 hover:text-white" title="Pandit Login">
                 <LockIcon className="w-6 h-6" />
              </button>
            )}

            {currentUser && (
              <button onClick={() => setView('home')} className="bg-white/10 p-3 rounded-full hover:bg-white/20 transition">
                <HomeIcon className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 no-scrollbar pb-24 relative z-10">
        <div className="max-w-5xl mx-auto w-full">
          
          {/* VIEW: HOME */}
          {view === 'home' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {/* Quote Card */}
              <div className="saffron-gradient p-6 rounded-3xl shadow-lg relative overflow-hidden group">
                <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all"></div>
                <p className="text-white divine-font text-xl md:text-2xl text-center italic relative z-10">"{quote}"</p>
              </div>

              {/* Action Grid */}
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setView('add_client')}
                  className={`bg-white p-6 rounded-3xl shadow-md flex flex-col items-center gap-4 border border-slate-100 active:scale-95 transition group ${!currentUser ? 'col-span-2' : ''}`}
                >
                  <div className="p-4 bg-orange-100 text-orange-600 rounded-2xl group-hover:bg-orange-600 group-hover:text-white transition-colors">
                    <PlusIcon className="w-10 h-10" />
                  </div>
                  <span className="font-bold text-slate-700 divine-font text-lg">New Yatri</span>
                </button>

                {currentUser && (
                  <button 
                    onClick={() => setView('ledger')}
                    className="bg-white p-6 rounded-3xl shadow-md flex flex-col items-center gap-4 border border-slate-100 active:scale-95 transition group"
                  >
                    <div className="p-4 bg-indigo-100 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <ClipboardIcon className="w-10 h-10" />
                    </div>
                    <span className="font-bold text-slate-700 divine-font text-lg">Ledger</span>
                  </button>
                )}

                {currentUser && (
                  <button 
                    onClick={() => { setView('face_search'); setActiveCameraField('face_search'); }}
                    className="bg-white p-6 rounded-3xl shadow-md flex flex-col items-center gap-4 border border-slate-100 active:scale-95 transition group col-span-2"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-purple-100 text-purple-600 rounded-2xl group-hover:bg-purple-600 group-hover:text-white transition-colors">
                        <FaceScanIcon className="w-10 h-10" />
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-slate-800 divine-font text-xl">Returning Yatri?</p>
                        <p className="text-xs text-slate-500">Scan face to find old records instantly</p>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Family Contacts */}
              <section>
                <h3 className="text-lg font-bold divine-font mb-4 flex items-center gap-2">
                  <PhoneIcon className="w-5 h-5 text-orange-500" /> Pandit Ji Directory
                </h3>
                <p className="text-xs text-slate-400 mb-4 -mt-2 ml-7">Tap on a Pandit for full profile & bio</p>
                <div className="space-y-3">
                  {panditContacts.map((c, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedPandit(c)}
                      className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-md transition cursor-pointer active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          {c.photo ? (
                            <img src={c.photo} alt={c.name} className="w-14 h-14 rounded-xl object-cover shadow-sm border border-slate-200" />
                          ) : (
                            <div className={`w-14 h-14 rounded-xl ${c.colorClass} flex items-center justify-center font-bold divine-font text-xl`}>
                              {c.initial}
                            </div>
                          )}
                          {currentUser && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActivePanditId(c.panditId);
                                setActiveCameraField('pandit_photo');
                              }}
                              className="absolute -bottom-1 -right-1 bg-white text-indigo-600 p-1.5 rounded-full shadow border border-slate-100 hover:bg-indigo-50"
                              title="Update Photo"
                            >
                              <CameraIcon className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 group-hover:text-orange-600 transition-colors">{c.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <p className="text-xs text-slate-400 font-bold uppercase">{c.role}</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl">
                         <div className="text-slate-300 group-hover:text-orange-400 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ... (Existing Views for ADD CLIENT, LEDGER, FACE SEARCH) ... */}
          {/* Note: I'm ensuring the rest of the file content matches existing */}
          
          {/* VIEW: ADD CLIENT */}
          {view === 'add_client' && (
            <div className="space-y-6 animate-in slide-in-from-right duration-500">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold divine-font">Yatri Registration</h2>
                <button onClick={() => setView('home')} className="text-slate-400 hover:text-slate-600"><XIcon /></button>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 space-y-6">
                <div className="flex justify-center">
                   <div 
                     onClick={() => setActiveCameraField('client')}
                     className="relative w-32 h-32 rounded-3xl bg-slate-100 border-4 border-white shadow-inner flex flex-col items-center justify-center cursor-pointer overflow-hidden hover:border-orange-200 transition"
                   >
                     {capturedPhoto ? (
                       <img src={capturedPhoto} className="w-full h-full object-cover" />
                     ) : (
                       <>
                         <CameraIcon className="w-10 h-10 text-slate-300" />
                         <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">Photo</span>
                       </>
                     )}
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                    <input 
                      type="text" 
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition"
                      placeholder="e.g. Rahul Sharma"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                    <input 
                      type="tel" 
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition"
                      placeholder="Mobile No."
                      value={formData.phone}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Home Town / State</label>
                  <input 
                    type="text" 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition"
                    placeholder="e.g. Jaipur, Rajasthan"
                    value={formData.address}
                    onChange={e => setFormData({...formData, address: e.target.value})}
                  />
                </div>

                {/* AI Plan Section */}
                <div className="bg-indigo-50/50 p-5 rounded-3xl border border-indigo-100 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Ritual or Itinerary (AI Assisted)</span>
                    <SparklesIcon className="w-4 h-4 text-orange-500 animate-pulse" />
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      className="flex-1 p-4 bg-white border border-indigo-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition text-sm"
                      placeholder="e.g. Yamuna Pujan vidhi"
                      value={formData.servicePlan}
                      onChange={e => setFormData({...formData, servicePlan: e.target.value})}
                    />
                    <button 
                      onClick={handleGeneratePlan}
                      disabled={isGeneratingPlan || !formData.servicePlan}
                      className="bg-indigo-600 text-white px-5 rounded-2xl font-bold text-xs shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition active:scale-95"
                    >
                      {isGeneratingPlan ? '...' : 'Generate'}
                    </button>
                  </div>
                  {ritualPlan && (
                    <div className="p-4 bg-white rounded-2xl border border-indigo-50 text-sm text-slate-600 italic leading-relaxed animate-in fade-in">
                      {ritualPlan}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Dakshina / Payment</label>
                  <input 
                    type="text" 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none transition"
                    placeholder="Amount & Mode"
                    value={formData.paymentDetails}
                    onChange={e => setFormData({...formData, paymentDetails: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Signature</label>
                  <SignaturePad onSave={setSignature} className="overflow-hidden" />
                </div>

                <div className="flex gap-3 pt-4">
                   <button 
                    onClick={() => setView('home')}
                    className="flex-1 py-4 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition"
                  >
                    Discard
                  </button>
                  <button 
                    onClick={handleSaveEntry}
                    className="flex-[2] py-4 bg-orange-600 text-white font-bold rounded-2xl shadow-xl shadow-orange-200 hover:bg-orange-700 transition active:scale-95"
                  >
                    Save Yatri Record
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: LEDGER */}
          {view === 'ledger' && (
            <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
               <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md pt-2 pb-4 space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <input 
                        type="text" 
                        placeholder="Search pilgrims, mobile or code..." 
                        className="w-full p-5 pl-12 bg-white rounded-3xl shadow-sm border border-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <button 
                      onClick={() => setShowFilters(!showFilters)} 
                      className={`p-5 rounded-3xl transition border border-transparent ${showFilters || dateFilter.start || dateFilter.end ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 'bg-white text-slate-400 border-slate-100 shadow-sm'}`}
                    >
                      <CalendarIcon className="w-6 h-6" />
                    </button>
                  </div>

                  {showFilters && (
                    <div className="grid grid-cols-2 gap-4 bg-white p-5 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-top">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">From Date</label>
                        <input 
                          type="date" 
                          className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-slate-700"
                          value={dateFilter.start}
                          onChange={e => setDateFilter({...dateFilter, start: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">To Date</label>
                        <input 
                          type="date" 
                          className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold text-slate-700"
                          value={dateFilter.end}
                          onChange={e => setDateFilter({...dateFilter, end: e.target.value})}
                        />
                      </div>
                      {(dateFilter.start || dateFilter.end) && (
                         <div className="col-span-2 flex justify-end">
                           <button 
                             onClick={() => setDateFilter({start: '', end: ''})}
                             className="text-xs text-red-500 font-bold hover:bg-red-50 px-3 py-1 rounded-lg transition"
                           >
                             Clear Date Filters
                           </button>
                         </div>
                      )}
                    </div>
                  )}
               </div>

               <div className="grid grid-cols-1 gap-4">
                 {filteredEntries.length === 0 ? (
                   <div className="py-20 text-center space-y-4">
                     <ClipboardIcon className="w-16 h-16 text-slate-200 mx-auto" />
                     <p className="text-slate-400 divine-font">No pilgrimage records found.</p>
                   </div>
                 ) : (
                   filteredEntries.map(e => (
                    <div key={e.id} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 group hover:shadow-md transition-all">
                      <div className="flex gap-5">
                        <div className="w-20 h-20 bg-slate-50 rounded-2xl overflow-hidden shadow-inner flex-shrink-0">
                          {e.clientPhoto ? (
                            <img src={e.clientPhoto} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 divine-font text-2xl font-bold">
                              {e.clientName.charAt(0)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <h3 className="text-xl font-bold text-slate-800 divine-font truncate">{e.clientName}</h3>
                            <span className="text-[9px] bg-indigo-50 text-indigo-500 px-2 py-1 rounded-full font-bold">{e.uniqueCode}</span>
                          </div>
                          <p className="text-slate-500 text-sm flex items-center gap-1 mt-1 font-mono">
                            <PhoneIcon className="w-3 h-3" /> {e.phone}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-wider">
                            Registered: {new Date(e.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-50">
                         <button 
                           onClick={() => setPrintEntry(e)}
                           className="flex-1 py-3 bg-orange-50 text-orange-600 rounded-2xl text-xs font-bold hover:bg-orange-600 hover:text-white transition flex items-center justify-center gap-2"
                         >
                           <PrintIcon className="w-4 h-4" /> View / Print
                         </button>
                         <button 
                            onClick={() => handleDeleteEntry(e.id)}
                            className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition"
                         >
                           <TrashIcon className="w-4 h-4" />
                         </button>
                      </div>
                    </div>
                   ))
                 )}
               </div>
            </div>
          )}

          {/* VIEW: FACE SEARCH RESULTS */}
          {view === 'face_search' && !activeCameraField && (
            <div className="space-y-8 animate-in zoom-in duration-300 pt-10">
               <div className="text-center">
                 <h2 className="text-2xl font-bold divine-font mb-2">Divine Recognition</h2>
                 <p className="text-slate-400 text-sm">Identifying Yatri through AI scan</p>
               </div>

               <div className="flex justify-center">
                 <div className="w-48 h-48 rounded-[3rem] overflow-hidden border-8 border-white shadow-2xl relative group">
                    {faceSearchImage && <img src={faceSearchImage} className="w-full h-full object-cover" />}
                    {isSearchingFace && (
                      <div className="absolute inset-0 bg-indigo-900/40 backdrop-blur-sm flex items-center justify-center">
                         <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                 </div>
               </div>

               {isSearchingFace ? (
                 <p className="text-center text-indigo-500 font-bold divine-font animate-pulse">Scanning Braj records...</p>
               ) : matchedClientId ? (
                 <div className="bg-green-50 border-2 border-green-200 rounded-[2.5rem] p-8 text-center animate-in slide-in-from-bottom">
                   <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                     <CheckIcon className="w-8 h-8" />
                   </div>
                   <h3 className="text-green-800 font-bold divine-font text-2xl mb-2">Record Located!</h3>
                   <p className="text-green-600 text-sm mb-6">We found a previous visit for {entries.find(e => e.id === matchedClientId)?.clientName}.</p>
                   <button 
                     onClick={() => {
                       setSearchQuery(entries.find(e => e.id === matchedClientId)?.uniqueCode || '');
                       setView('ledger');
                     }}
                     className="bg-green-600 text-white px-10 py-4 rounded-2xl font-bold shadow-lg hover:shadow-xl transition active:scale-95"
                   >
                     Open Record
                   </button>
                 </div>
               ) : (
                 <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100 text-center">
                    <p className="text-slate-400 divine-font text-lg mb-6">No matching pilgrim found in current records.</p>
                    <button 
                      onClick={() => setView('add_client')}
                      className="text-orange-600 font-bold divine-font text-xl border-b-2 border-orange-200"
                    >
                      Register as New Yatri
                    </button>
                 </div>
               )}
            </div>
          )}

        </div>
      </main>

      {/* Footer / Mobile Nav - Only visible on main screens */}
      {view !== 'add_client' && view !== 'login' && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-3 md:hidden z-40 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
           <div className="flex justify-around items-center">
              <button onClick={() => setView('home')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === 'home' ? 'text-orange-600 bg-orange-50' : 'text-slate-400'}`}>
                <HomeIcon className="w-6 h-6" />
                <span className="text-[10px] font-bold mt-1">Home</span>
              </button>
              <button onClick={() => setView('add_client')} className="flex flex-col items-center -mt-10">
                <div className="bg-orange-600 p-4 rounded-full shadow-lg shadow-orange-200 text-white">
                  <PlusIcon className="w-8 h-8" />
                </div>
                <span className="text-[10px] font-bold mt-2 text-slate-500">New Yatri</span>
              </button>
              {currentUser && (
                <button onClick={() => setView('ledger')} className={`flex flex-col items-center p-2 rounded-xl transition-all ${view === 'ledger' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}>
                  <ClipboardIcon className="w-6 h-6" />
                  <span className="text-[10px] font-bold mt-1">Ledger</span>
                </button>
              )}
           </div>
        </nav>
      )}
    </div>
  );
};

export default App;