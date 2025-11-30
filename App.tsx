import React, { useState, useEffect, useRef } from 'react';
import { PANDIT_CONTACTS } from './constants';
import { Contact, ClientEntry, ViewState, BackgroundImage } from './types';
import { generateRitualPlan, findMatchingFace } from './services/geminiService';
import { dbService } from './services/db';
import SignaturePad from './components/SignaturePad';
import CameraCapture from './components/CameraCapture';
import { HomeIcon, PlusIcon, ClipboardIcon, PhoneIcon, SparklesIcon, ImagePlusIcon, PrintIcon, DownloadIcon, CameraIcon, FaceScanIcon, CheckIcon, SearchIcon, CalendarIcon, RefreshCcwIcon, TrashIcon, XIcon, AlertTriangleIcon } from './components/Icons';

// Helper to detect storage quota errors across browsers
const isQuotaError = (e: any) => {
  return (
    e instanceof DOMException &&
    // everything except Firefox
    (e.code === 22 ||
      // Firefox
      e.code === 1014 ||
      // test name field too, because code might not be present
      // everything except Firefox
      e.name === 'QuotaExceededError' ||
      // Firefox
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
  const [view, setView] = useState<ViewState>('home');
  const [entries, setEntries] = useState<ClientEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  
  const [bgImages, setBgImages] = useState<BackgroundImage[]>([]);
  const [currentBgIndex, setCurrentBgIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Confirmation Modal State
  const [confirmState, setConfirmState] = useState<ConfirmationState | null>(null);

  // Storage Error State
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [failedEntry, setFailedEntry] = useState<ClientEntry | null>(null);

  // Load entries and backgrounds from IndexedDB or LocalStorage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Try DB First for Clients
        const data = await dbService.getAllClients();
        setEntries(data);
        
        // Load Backgrounds
        const bgs = await dbService.getAllBackgrounds();
        setBgImages(bgs);

      } catch (err) {
        console.warn("IndexedDB unavailable, checking LocalStorage fallback...");
        try {
          // Fallback to LocalStorage
          const localData = localStorage.getItem('yatra_entries_backup');
          if (localData) {
            setEntries(JSON.parse(localData));
          }
        } catch (lsErr) {
          console.error("Critical: Storage unavailable", lsErr);
        }
      } finally {
        setLoadingEntries(false);
      }
    };
    loadData();
  }, []);

  // Slideshow
  useEffect(() => {
    if (bgImages.length > 1) {
      const interval = setInterval(() => {
        setCurrentBgIndex(prev => (prev + 1) % bgImages.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [bgImages]);

  const requestConfirm = (title: string, message: string, onConfirm: () => void, type: 'danger' | 'info' = 'info') => {
    setConfirmState({
      isOpen: true,
      title,
      message,
      onConfirm,
      type
    });
  };

  const closeConfirm = () => {
    setConfirmState(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files: File[] = Array.from(e.target.files);
      const newImages: BackgroundImage[] = [];

      const readFile = (file: File): Promise<BackgroundImage> => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
             const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
             resolve({
               id: uniqueId,
               dataUrl: ev.target?.result as string
             });
          };
          reader.readAsDataURL(file);
        });
      };

      for (const file of files) {
        try {
          const img = await readFile(file);
          await dbService.saveBackground(img);
          newImages.push(img);
        } catch (err) {
          console.error("Error saving background", err);
          if (isQuotaError(err)) {
            alert("Storage full! Cannot add more background images.");
          }
        }
      }
      
      setBgImages(prev => [...prev, ...newImages]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearBackgrounds = async () => {
    requestConfirm(
      "Clear Backgrounds",
      "Are you sure you want to remove all custom background photos? This cannot be undone.",
      async () => {
        try {
          await dbService.clearBackgrounds();
          setBgImages([]);
          setCurrentBgIndex(0);
          closeConfirm();
        } catch (e) {
          alert("Error clearing backgrounds");
          closeConfirm();
        }
      },
      'danger'
    );
  };

  // Called when storage modal actions resolve
  const refreshData = async () => {
      const data = await dbService.getAllClients();
      setEntries(data);
  };

  const handleSaveEntry = async (newEntry: ClientEntry): Promise<boolean> => {
    try {
      // 1. Try IndexedDB (Best for Photos)
      await dbService.saveClient(newEntry);
      setEntries(prev => [newEntry, ...prev]);
      return true;
    } catch (err: any) {
      // Check for quota error in IDB or Fallback
      if (isQuotaError(err) || err.message?.toLowerCase().includes('quota')) {
        setFailedEntry(newEntry);
        setShowStorageModal(true);
        return false; // Stop here, modal will handle resolution
      }

      console.warn("IndexedDB Save Failed, attempting fallback...", err);
      
      try {
        // 2. Fallback: LocalStorage
        const currentData = JSON.parse(localStorage.getItem('yatra_entries_backup') || '[]');
        const updatedData = [newEntry, ...currentData];
        localStorage.setItem('yatra_entries_backup', JSON.stringify(updatedData));
        setEntries(prev => [newEntry, ...prev]);
        alert("⚠️ Saved to Local Backup (Database unavailable).");
        return true;
      } catch (lsErr: any) {
         // 3. Catch Quota Error in LocalStorage too
         if (isQuotaError(lsErr) || lsErr.message?.toLowerCase().includes('quota')) {
            setFailedEntry(newEntry);
            setShowStorageModal(true);
            return false;
         }
         alert("❌ Error saving record: " + lsErr.message);
         return false;
      }
    }
  };

  const handleDeleteEntry = async (id: number) => {
    requestConfirm(
      "Delete Record",
      "Are you sure you want to delete this record permanently?",
      async () => {
        try {
          await dbService.deleteClient(id);
          
          try {
             const localData = JSON.parse(localStorage.getItem('yatra_entries_backup') || '[]');
             const newLocalData = localData.filter((e: ClientEntry) => e.id !== id);
             localStorage.setItem('yatra_entries_backup', JSON.stringify(newLocalData));
          } catch(e) {}

          setEntries(prev => prev.filter(e => e.id !== id));
          closeConfirm();
        } catch (e) {
          alert("Error deleting record");
          closeConfirm();
        }
      },
      'danger'
    );
  };

  const hasBg = bgImages.length > 0;

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      
      {/* Background Layer */}
      {hasBg ? (
        <div className="fixed inset-0 z-[-1] print:hidden">
          {bgImages.map((img, idx) => (
            <div 
              key={img.id}
              className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${idx === currentBgIndex ? 'opacity-100' : 'opacity-0'}`}
              style={{ backgroundImage: `url(${img.dataUrl})` }}
            />
          ))}
          <div className="absolute inset-0 bg-indigo-900/40 backdrop-blur-[1px]"></div>
        </div>
      ) : (
        <div className="fixed inset-0 z-[-1] bg-gradient-to-br from-indigo-50 to-slate-200 print:hidden"></div>
      )}

      {/* Header */}
      <nav className={`h-16 flex-none ${hasBg ? 'bg-indigo-950/80 backdrop-blur-md border-b border-white/10' : 'bg-indigo-700 shadow-md'} text-white z-20 no-print transition-colors duration-300`}>
        <div className="max-w-lg mx-auto h-full px-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🕉️</span>
            <div>
              <h1 className="font-bold text-lg leading-tight">Yatra Seva</h1>
              <p className="text-[10px] text-indigo-200 uppercase tracking-wider font-semibold">Rajdrnath Register</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button 
               onClick={() => setView('face_search')}
               className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all text-indigo-100"
               title="Face Search"
             >
               <FaceScanIcon className="w-6 h-6" />
             </button>
             {hasBg && (
               <button 
                 onClick={handleClearBackgrounds}
                 className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all text-red-200"
                 title="Clear Backgrounds"
               >
                 <TrashIcon className="w-6 h-6" />
               </button>
             )}
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all text-indigo-100"
               title="Add Background Photos"
             >
               <ImagePlusIcon className="w-6 h-6" />
             </button>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept="image/*" 
            onChange={handleImageUpload} 
          />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-grow overflow-y-auto no-scrollbar scroll-smooth">
        <div className="max-w-lg mx-auto p-4 pb-24 min-h-full md:max-w-2xl print:max-w-none print:p-0 print:h-auto print:overflow-visible">
          {view === 'home' && <HomeView contacts={PANDIT_CONTACTS} hasBg={hasBg} setView={setView} />}
          {view === 'add_client' && (
             <AddClientView 
               onSave={handleSaveEntry} 
               onSuccess={() => setView('ledger')} 
               hasBg={hasBg}
               requestConfirm={requestConfirm}
               closeConfirm={closeConfirm}
             />
          )}
          {view === 'ledger' && <LedgerView entries={entries} loading={loadingEntries} hasBg={hasBg} onDelete={handleDeleteEntry} />}
          {view === 'face_search' && <FaceSearchView entries={entries} hasBg={hasBg} />}
        </div>
      </main>

      {/* Bottom Navigation */}
      <div className={`fixed bottom-0 left-0 right-0 h-20 ${hasBg ? 'glass-panel border-t border-white/20' : 'bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]'} z-30 no-print max-w-lg mx-auto md:relative md:max-w-none md:bg-transparent md:border-none md:pointer-events-none md:hidden`}></div>
      
      <div className={`fixed bottom-0 left-0 right-0 h-16 z-40 no-print`}>
         <div className={`max-w-lg mx-auto h-full flex justify-around items-center ${hasBg ? 'glass-panel border-t border-white/20' : 'bg-white border-t border-slate-200'}`}>
            <NavButton active={view === 'home'} onClick={() => setView('home')} icon={<HomeIcon />} label="Home" hasBg={hasBg} />
            <NavButton active={view === 'add_client'} onClick={() => setView('add_client')} icon={<PlusIcon />} label="Add Client" hasBg={hasBg} />
            <NavButton active={view === 'ledger'} onClick={() => setView('ledger')} icon={<ClipboardIcon />} label="Ledger" hasBg={hasBg} />
         </div>
      </div>

      {/* Confirmation Modal */}
      {confirmState && (
        <ConfirmationModal
          isOpen={confirmState.isOpen}
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={closeConfirm}
          type={confirmState.type}
        />
      )}

      {/* Storage Recovery Modal */}
      {showStorageModal && failedEntry && (
        <StorageRecoveryModal
          isOpen={showStorageModal}
          onClose={() => setShowStorageModal(false)}
          failedEntry={failedEntry}
          onSuccess={(entry) => {
             // If entry provided, it means we saved text-only
             if (entry) {
                setEntries(prev => [entry, ...prev]);
                setView('ledger');
             }
             setShowStorageModal(false);
             setFailedEntry(null);
          }}
          refreshData={refreshData}
        />
      )}

    </div>
  );
};

// --- Sub-Components ---

const StorageRecoveryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  failedEntry: ClientEntry;
  onSuccess: (savedEntry?: ClientEntry) => void;
  refreshData: () => Promise<void>;
}> = ({ isOpen, onClose, failedEntry, onSuccess, refreshData }) => {
  if (!isOpen) return null;

  const handleSaveTextOnly = async () => {
    try {
      const entryNoPhoto = { ...failedEntry, clientPhoto: undefined };
      await dbService.saveClient(entryNoPhoto);
      onSuccess(entryNoPhoto);
    } catch (e) {
      alert("Still cannot save. Critical storage failure.");
    }
  };

  const handleOptimizeImages = async () => {
    try {
      // Remove photos from records older than 30 days
      const count = await dbService.stripOldPhotos(30);
      await refreshData();
      alert(`Optimization complete! Removed photos from ${count} old records.`);
      onClose(); // Close modal so user can try saving again normally
    } catch (e) {
      alert("Optimization failed.");
    }
  };

  const handleDeleteOld = async () => {
    if (window.confirm("Are you sure? This will delete ALL records older than 1 year.")) {
      try {
        const count = await dbService.deleteOldRecords(365);
        await refreshData();
        alert(`Cleanup complete! Deleted ${count} records older than 1 year.`);
        onClose();
      } catch (e) {
        alert("Cleanup failed.");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
        <div className="bg-red-50 p-4 border-b border-red-100 flex items-center gap-3">
          <div className="bg-red-100 text-red-600 p-2 rounded-full">
            <AlertTriangleIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-red-900">Storage Full!</h3>
            <p className="text-xs text-red-700">Cannot save photo. What would you like to do?</p>
          </div>
        </div>
        
        <div className="p-4 space-y-3">
          <button 
            onClick={handleSaveTextOnly}
            className="w-full bg-indigo-50 border border-indigo-100 p-3 rounded-xl flex items-center justify-between hover:bg-indigo-100 transition text-left"
          >
             <div>
               <div className="font-bold text-indigo-900 text-sm">Save Without Photo</div>
               <div className="text-xs text-indigo-600">Saves text & signature immediately.</div>
             </div>
             <span className="text-xl">📄</span>
          </button>

          <button 
             onClick={handleOptimizeImages}
             className="w-full bg-orange-50 border border-orange-100 p-3 rounded-xl flex items-center justify-between hover:bg-orange-100 transition text-left"
          >
             <div>
               <div className="font-bold text-orange-900 text-sm">Clear Old Photos</div>
               <div className="text-xs text-orange-600">Remove photos from records &gt; 30 days.</div>
             </div>
             <span className="text-xl">🧹</span>
          </button>

          <button 
             onClick={handleDeleteOld}
             className="w-full bg-red-50 border border-red-100 p-3 rounded-xl flex items-center justify-between hover:bg-red-100 transition text-left"
          >
             <div>
               <div className="font-bold text-red-900 text-sm">Delete Old Records</div>
               <div className="text-xs text-red-600">Delete all records older than 1 year.</div>
             </div>
             <span className="text-xl">🗑️</span>
          </button>
        </div>

        <div className="bg-slate-50 p-3 text-right">
          <button onClick={onClose} className="text-slate-500 font-bold text-sm hover:underline">Cancel</button>
        </div>
      </div>
    </div>
  );
};

const ConfirmationModal: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  type: 'danger' | 'info';
}> = ({ isOpen, title, message, onConfirm, onCancel, type }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out] p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-[scaleIn_0.2s_ease-out]">
        <div className={`p-4 flex items-center gap-3 border-b ${type === 'danger' ? 'bg-red-50 border-red-100' : 'bg-indigo-50 border-indigo-100'}`}>
          <div className={`p-2 rounded-full ${type === 'danger' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
            <AlertTriangleIcon className="w-6 h-6" />
          </div>
          <h3 className={`font-bold text-lg ${type === 'danger' ? 'text-red-900' : 'text-indigo-900'}`}>{title}</h3>
        </div>
        <div className="p-6">
          <p className="text-slate-600 font-medium whitespace-pre-wrap">{message}</p>
        </div>
        <div className="bg-slate-50 p-4 flex gap-3 justify-end border-t border-slate-100">
          <button 
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-slate-600 font-bold hover:bg-slate-200 transition text-sm"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className={`px-5 py-2 rounded-lg text-white font-bold shadow-lg active:scale-95 transition text-sm flex items-center gap-2 ${type === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {type === 'danger' ? 'Yes, Delete' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label, hasBg }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, hasBg: boolean }) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center justify-center w-full h-full transition-all duration-200 
      ${active 
        ? (hasBg ? 'text-indigo-900 scale-105' : 'text-indigo-600 scale-105') 
        : 'text-slate-400 hover:text-slate-600'
      }`}
  >
    <div className={`p-1 rounded-full ${active ? (hasBg ? 'bg-indigo-100/50' : 'bg-indigo-50') : ''}`}>
      {React.isValidElement(icon) 
        ? React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: "w-6 h-6" }) 
        : icon
      }
    </div>
    <span className="text-[10px] font-bold mt-1">{label}</span>
  </button>
);

const HomeView: React.FC<{ contacts: Contact[], hasBg: boolean, setView: (v: ViewState) => void }> = ({ contacts, hasBg, setView }) => (
  <div className="space-y-6 animate-[fadeIn_0.5s_ease-out]">
    <div className={`${hasBg ? 'glass-panel' : 'bg-white'} rounded-2xl shadow-lg p-6 border-b-4 border-indigo-500 text-center relative overflow-hidden`}>
       <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 via-indigo-500 to-green-400"></div>
       <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Yatra To Mathura</h2>
       <div className="w-16 h-1 bg-orange-400 mx-auto my-3 rounded-full"></div>
       <p className="text-slate-600 font-medium">Official Digital Yatra Register</p>
       
       <div className="flex gap-2 justify-center mt-4">
         <button onClick={() => setView('face_search')} className="bg-indigo-100 text-indigo-800 px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-indigo-200 transition">
            <FaceScanIcon className="w-4 h-4" /> Face Search
         </button>
       </div>
    </div>

    <div className={`${hasBg ? 'glass-panel' : 'bg-white'} rounded-2xl shadow-lg overflow-hidden border border-slate-100`}>
      <div className="bg-slate-100/80 px-5 py-4 border-b border-slate-200 flex items-center gap-2">
        <PhoneIcon className="w-5 h-5 text-slate-500" />
        <h3 className="font-bold text-slate-700">Contact Directory</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {contacts.map((contact, i) => (
          <a 
            key={i} 
            href={`tel:${contact.phone}`} 
            className="flex items-center p-4 hover:bg-slate-50 transition active:bg-slate-100"
          >
            <div className={`h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold mr-4 shadow-sm shrink-0 ${contact.colorClass}`}>
              {contact.initial}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-slate-800 truncate">{contact.name}</h3>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{contact.role}</p>
            </div>
            <div className="p-2 bg-green-50 rounded-full text-green-600">
               <PhoneIcon className="w-4 h-4" />
            </div>
          </a>
        ))}
      </div>
    </div>
  </div>
);

const AddClientView: React.FC<{ 
  onSave: (entry: ClientEntry) => Promise<boolean>, 
  onSuccess: () => void,
  hasBg: boolean,
  requestConfirm: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'info') => void,
  closeConfirm: () => void
}> = ({ onSave, onSuccess, hasBg, requestConfirm, closeConfirm }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    plan: '',
    payment: ''
  });
  const [code, setCode] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [signature, setSignature] = useState('');
  const [clientPhoto, setClientPhoto] = useState<string | undefined>(undefined);
  const [photoMode, setPhotoMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Generate code once on mount
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const dateSuffix = new Date().getDate().toString().padStart(2,'0');
    setCode(`YATRA-${dateSuffix}${randomSuffix}`);
  }, []);

  const handleAiGenerate = async () => {
    if (!formData.plan) {
      alert("Please enter a ritual name first (e.g. Rudrabhishek)");
      return;
    }
    setAiLoading(true);
    const result = await generateRitualPlan(formData.plan);
    setFormData(prev => ({ ...prev, plan: prev.plan + "\n\n" + result }));
    setAiLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    let confirmMsg = `Are you sure you want to save the record for ${formData.name}?`;
    if (!signature) confirmMsg = `⚠️ No signature provided.\n\n${confirmMsg}`;
    
    // Use custom confirmation modal via callback
    requestConfirm("Save Record", confirmMsg, async () => {
        setIsSubmitting(true);

        try {
          // Create safe timestamp and ID
          const timestamp = Date.now();
          const uniqueId = timestamp + Math.floor(Math.random() * 1000);

          const newEntry: ClientEntry = {
            id: uniqueId,
            uniqueCode: code,
            clientName: formData.name,
            phone: formData.phone,
            address: formData.address,
            servicePlan: formData.plan,
            paymentDetails: formData.payment,
            clientPhoto: clientPhoto,
            signatureImage: signature || null,
            timestamp: timestamp
          };
          
          const success = await onSave(newEntry);
          
          if (success) {
            onSuccess();
            closeConfirm(); // Should be closed by the modal logic anyway
          } else {
            setIsSubmitting(false); 
            closeConfirm();
          }
        } catch (e: any) {
          console.error("Submission error:", e);
          alert("Unexpected error: " + e.message);
          setIsSubmitting(false);
          closeConfirm();
        }
    }, 'info');
  };

  const inputClass = `w-full p-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${hasBg ? 'bg-white/80 border-0 shadow-inner' : 'bg-slate-50 border border-slate-200'}`;
  const labelClass = "block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 ml-1";

  return (
    <div className={`${hasBg ? 'glass-panel' : 'bg-white'} rounded-2xl shadow-lg overflow-hidden animate-[slideUp_0.3s_ease-out]`}>
      <div className="bg-slate-100/50 p-4 border-b border-slate-200 flex justify-between items-center">
        <h2 className="font-bold text-lg text-slate-800">New Yatra Record</h2>
        <span className="font-mono text-xs font-bold bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full border border-indigo-200">
          {code}
        </span>
      </div>
      
      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        {/* Photo Section */}
        <div>
           <label className={labelClass}>Client Photo</label>
           {photoMode ? (
             <CameraCapture onCapture={(img) => { setClientPhoto(img); setPhotoMode(false); }} />
           ) : (
             clientPhoto ? (
                <div className="relative w-32 h-32">
                  <img src={clientPhoto} className="w-full h-full object-cover rounded-xl border-2 border-indigo-100" />
                  <button type="button" onClick={() => setClientPhoto(undefined)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow"><div className="w-4 h-4 flex items-center justify-center">×</div></button>
                </div>
             ) : (
                <button type="button" onClick={() => setPhotoMode(true)} className="flex items-center gap-2 bg-slate-100 text-slate-600 px-4 py-3 rounded-xl w-full font-medium hover:bg-slate-200 transition">
                   <CameraIcon className="w-5 h-5" /> Take Photo
                </button>
             )
           )}
        </div>

        <div>
           <label className={labelClass}>Client Name</label>
           <input required className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Amit Kumar" />
        </div>
        <div>
           <label className={labelClass}>Phone Number</label>
           <input required type="tel" className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="e.g. 9876543210" />
        </div>
        <div>
           <label className={labelClass}>Address</label>
           <input className={inputClass} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="City or Full Address" />
        </div>
        <div>
           <div className="flex justify-between items-end mb-1">
             <label className={labelClass}>Service / Ritual Plan</label>
             <button 
               type="button" 
               onClick={handleAiGenerate}
               disabled={aiLoading}
               className="text-[10px] bg-indigo-600 text-white px-2 py-1 rounded-md flex items-center gap-1 font-bold shadow-sm hover:bg-indigo-700 disabled:opacity-50"
             >
               <SparklesIcon className="w-3 h-3" />
               {aiLoading ? "Thinking..." : "AI Generate"}
             </button>
           </div>
           <textarea required rows={5} className={inputClass} value={formData.plan} onChange={e => setFormData({...formData, plan: e.target.value})} placeholder="Type ritual (e.g. Yamuna Pujan) or trip plan (e.g. 2 Days Mathura)..." />
        </div>
        <div>
           <label className={labelClass}>Payment Details</label>
           <input required className={inputClass} value={formData.payment} onChange={e => setFormData({...formData, payment: e.target.value})} placeholder="Amount & Status" />
        </div>
        <div>
           <label className={labelClass}>Client Signature</label>
           <SignaturePad onSave={setSignature} className="mt-1" />
        </div>

        <button 
          type="submit" 
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-indigo-600 to-indigo-800 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
           {isSubmitting ? (
             <>
               <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
               <span>Saving...</span>
             </>
           ) : (
             <>
               <span>💾</span> Save Record
             </>
           )}
        </button>
      </form>
    </div>
  );
};

const LedgerView: React.FC<{ entries: ClientEntry[], loading: boolean, hasBg: boolean, onDelete: (id: number) => void }> = ({ entries, loading, hasBg, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const filteredEntries = entries.filter(entry => {
    // Search Text Filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      !searchTerm ||
      entry.clientName.toLowerCase().includes(searchLower) ||
      entry.phone.includes(searchLower) ||
      entry.uniqueCode.toLowerCase().includes(searchLower) ||
      entry.servicePlan.toLowerCase().includes(searchLower);

    // Date Range Filter
    let matchesDate = true;
    if (dateFrom || dateTo) {
       const entryDate = new Date(entry.timestamp);
       entryDate.setHours(0,0,0,0);
       
       if (dateFrom) {
         const from = new Date(dateFrom);
         if (entryDate < from) matchesDate = false;
       }
       if (dateTo) {
         const to = new Date(dateTo);
         if (entryDate > to) matchesDate = false;
       }
    }

    return matchesSearch && matchesDate;
  });

  const clearFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
  };

  const handlePrint = () => {
    setShowPreview(true);
  };

  return (
    <>
      <div className="space-y-4 animate-[fadeIn_0.5s_ease-out] print:space-y-0 print:block">
        {/* Screen Header */}
        <div className={`flex justify-between items-center ${hasBg ? 'glass-panel' : 'bg-white'} p-4 rounded-xl shadow-sm border border-slate-100 no-print`}>
          <div>
            <h2 className="font-bold text-lg text-slate-800">Ledger Records</h2>
            <p className="text-xs text-slate-500">{loading ? 'Loading...' : `Showing: ${filteredEntries.length} / ${entries.length}`}</p>
          </div>
          <button onClick={handlePrint} className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-slate-900 shadow-lg shadow-slate-300 active:scale-95 transition-transform">
            <PrintIcon className="w-4 h-4" /> Print / PDF
          </button>
        </div>

        {/* Filter Controls (No Print) */}
        <div className={`no-print ${hasBg ? 'glass-panel' : 'bg-white'} p-4 rounded-xl shadow-sm border border-slate-100 space-y-3`}>
          <div className="flex gap-2 items-center mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter Records</span>
              {(searchTerm || dateFrom || dateTo) && (
                <button onClick={clearFilters} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded flex items-center gap-1 hover:bg-slate-200">
                  <RefreshCcwIcon className="w-3 h-3" /> Clear
                </button>
              )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <SearchIcon className="w-4 h-4" />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Search name, phone, code..." 
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>
              <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <span className="text-[10px] font-bold">FROM</span>
                    </div>
                    <input 
                      type="date" 
                      className="w-full pl-12 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-600"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="relative flex-1">
                    <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                      <span className="text-[10px] font-bold">TO</span>
                    </div>
                    <input 
                      type="date" 
                      className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-600"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
              </div>
          </div>
        </div>

        {/* Print Header (Visible during actual Print) */}
        <div className="hidden print:block mb-8 text-center border-b-2 border-black pb-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-4xl">🕉️</span>
            <div className="text-right">
                <h1 className="text-2xl font-bold text-black uppercase tracking-wider">Yatra To Mathura</h1>
                <p className="text-black/70 text-sm">Authorized Yatra Service • Mathura</p>
            </div>
          </div>
          <div className="flex justify-between items-end text-xs text-slate-500 px-1 font-mono border-t border-black pt-2">
              <span>Date: {new Date().toLocaleDateString()}</span>
              <span>Records: {filteredEntries.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-500">Loading database...</div>
        ) : filteredEntries.length === 0 ? (
          <div className={`text-center py-20 px-6 rounded-2xl border-2 border-dashed ${hasBg ? 'bg-white/60 border-white/50 text-slate-700' : 'border-slate-200 text-slate-400'} no-print`}>
            <ClipboardIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No matching records found.</p>
            {(searchTerm || dateFrom || dateTo) && <button onClick={clearFilters} className="text-indigo-600 font-bold mt-2 text-sm hover:underline">Clear Filters</button>}
          </div>
        ) : (
          <div className="space-y-4 print:space-y-8">
            {filteredEntries.map(entry => (
              <div key={entry.id} className={`${hasBg ? 'glass-panel' : 'bg-white'} rounded-xl shadow-sm border border-slate-100 overflow-hidden page-break print:break-inside-avoid print:shadow-none print:border-2 print:border-black print:rounded-none print:bg-white print:mb-8`}>
                <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-200 flex justify-between items-center print:bg-slate-100 print:border-b-2 print:border-black print:py-2">
                    <span className="font-bold text-slate-600 text-xs uppercase tracking-wide print:text-black">
                      {new Date(entry.timestamp).toLocaleDateString()} 
                      <span className="print:hidden"> • {new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs bg-white border border-slate-200 px-2 py-1 rounded text-slate-600 print:text-black print:border-black">
                        {entry.uniqueCode}
                      </span>
                      <button onClick={() => onDelete(entry.id)} className="no-print text-red-400 hover:text-red-600 p-1">
                        <div className="w-4 h-4 flex items-center justify-center">×</div>
                      </button>
                    </div>
                </div>
                <div className="p-5 print:p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4 print:flex-row">
                      <div className="flex gap-4">
                          {entry.clientPhoto && (
                            <img src={entry.clientPhoto} className="w-16 h-16 rounded-lg object-cover border border-slate-200 print:w-20 print:h-20 print:grayscale print:border-black" alt="Client" />
                          )}
                          <div>
                            <h3 className="text-xl font-bold text-slate-900 print:text-black leading-none mb-1">{entry.clientName}</h3>
                            <div className="flex flex-col gap-1 text-sm text-slate-500 print:text-black mt-2">
                              <span className="flex items-center gap-1"><PhoneIcon className="w-3 h-3" /> {entry.phone}</span>
                              {entry.address && <span className="text-xs">{entry.address}</span>}
                            </div>
                          </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                          <div className="inline-block border border-green-200 bg-green-50 text-green-800 px-3 py-1 rounded-md font-bold text-sm print:bg-transparent print:border-black print:text-black print:rounded-none">
                            {entry.paymentDetails}
                          </div>
                      </div>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mb-4 font-serif print:bg-white print:border-0 print:p-0 print:pl-2 print:border-l-2 print:border-black print:rounded-none print:text-justify print:text-black">
                      {entry.servicePlan}
                    </div>
                    <div className="flex justify-between items-end mt-4 pt-4 border-t border-slate-100 print:border-black print:mt-4 print:pt-4">
                        <div className="hidden print:block text-[10px] text-black pt-8 font-bold">Authorized Signature: _______________________</div>
                        {entry.signatureImage ? (
                            <div className="flex flex-col items-end">
                                <img src={entry.signatureImage} alt="Signature" className="h-10 object-contain border-b border-slate-300 pb-1 print:h-12 print:grayscale print:border-black" />
                                <span className="text-[10px] text-slate-400 mt-1 print:text-black">Client Signature</span>
                            </div>
                        ) : <div className="text-[10px] text-slate-300 italic">No Signature</div>}
                    </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Print Preview Modal */}
      {showPreview && (
        <PrintPreviewModal 
          entries={filteredEntries} 
          onClose={() => setShowPreview(false)} 
          onPrint={() => {
            setShowPreview(false);
            setTimeout(() => window.print(), 300);
          }} 
        />
      )}
    </>
  );
};

const PrintPreviewModal: React.FC<{ entries: ClientEntry[], onClose: () => void, onPrint: () => void }> = ({ entries, onClose, onPrint }) => {
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    const element = document.getElementById('print-preview-content');
    
    // We need to temporarily ensure the element is visible and styled for PDF
    // But since it's in the modal, it is visible. 
    
    const opt = {
      margin: 10,
      filename: `Yatra_Register_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    if (element && (window as any).html2pdf) {
      try {
        await (window as any).html2pdf().set(opt).from(element).save();
      } catch (e) {
        console.error("PDF Generation Error", e);
        alert("Error generating PDF. Please try standard print.");
      }
    } else {
      alert("PDF Library not loaded. Please try again.");
    }
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-md no-print animate-[fadeIn_0.2s_ease-out]">
      {/* Toolbar */}
      <div className="flex-none h-16 bg-slate-800 text-white flex items-center justify-between px-4 shadow-md border-b border-slate-700">
        <h3 className="font-bold text-lg flex items-center gap-2">
            <PrintIcon className="w-5 h-5 text-indigo-400" />
            Print Preview
        </h3>
        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded text-slate-300 hover:text-white font-medium text-sm transition">Cancel</button>
          
          <button 
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2 shadow transition disabled:opacity-50"
          >
             {downloading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <DownloadIcon className="w-4 h-4" />}
             Download PDF
          </button>

          <button onClick={onPrint} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-full font-bold text-sm flex items-center gap-2 shadow-lg active:scale-95 transition">
            <PrintIcon className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-grow overflow-y-auto p-8 bg-slate-900 flex justify-center custom-scrollbar">
        {/* Paper Simulation */}
        <div id="print-preview-content" className="bg-white text-black w-full max-w-[210mm] shadow-2xl min-h-[297mm] p-[10mm] relative">
          {/* Header */}
          <div className="mb-8 text-center border-b-2 border-black pb-6">
            <div className="flex justify-between items-center mb-4">
              <span className="text-4xl">🕉️</span>
              <div className="text-right">
                  <h1 className="text-2xl font-bold text-black uppercase tracking-wider">Yatra To Mathura</h1>
                  <p className="text-black/70 text-sm">Authorized Yatra Service • Mathura</p>
              </div>
            </div>
            <div className="flex justify-between items-end text-xs text-slate-500 px-1 font-mono border-t border-black pt-2">
                <span>Date: {new Date().toLocaleDateString()}</span>
                <span>Records: {entries.length}</span>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-6">
            {entries.length === 0 ? (
               <div className="text-center py-20 text-slate-400 italic">No records selected for printing.</div>
            ) : (
               entries.map(entry => (
                <div key={entry.id} className="border-2 border-black bg-white break-inside-avoid mb-6">
                   <div className="bg-slate-100 border-b-2 border-black py-2 px-4 flex justify-between items-center">
                      <span className="font-bold text-black text-xs uppercase tracking-wide">
                        {new Date(entry.timestamp).toLocaleDateString()}
                      </span>
                      <span className="font-mono font-bold text-xs bg-white border border-black px-2 py-1 text-black">
                        {entry.uniqueCode}
                      </span>
                   </div>
                   <div className="p-4">
                      <div className="flex flex-row justify-between items-start gap-4 mb-4">
                         <div className="flex gap-4">
                            {entry.clientPhoto && (
                              <img src={entry.clientPhoto} className="w-20 h-20 rounded object-cover border border-black grayscale" alt="Client" />
                            )}
                            <div>
                              <h3 className="text-xl font-bold text-black leading-none mb-1">{entry.clientName}</h3>
                              <div className="flex flex-col gap-1 text-sm text-black mt-2">
                                <span className="flex items-center gap-1"><PhoneIcon className="w-3 h-3" /> {entry.phone}</span>
                                {entry.address && <span className="text-xs">{entry.address}</span>}
                              </div>
                            </div>
                         </div>
                         <div className="text-right flex-shrink-0">
                            <div className="inline-block border border-black px-3 py-1 font-bold text-sm text-black">
                              {entry.paymentDetails}
                            </div>
                         </div>
                      </div>
                      <div className="pl-2 border-l-2 border-slate-300 text-sm text-justify text-black mb-4 whitespace-pre-wrap font-serif">
                        {entry.servicePlan}
                      </div>
                      <div className="flex justify-between items-end mt-2 pt-2 border-t border-black">
                          <div className="text-[10px] text-black pt-8 font-bold">Authorized Signature: _______________________</div>
                          {entry.signatureImage ? (
                              <div className="flex flex-col items-end">
                                  <img src={entry.signatureImage} alt="Signature" className="h-12 object-contain grayscale" />
                                  <span className="text-[10px] text-black mt-1">Client Signature</span>
                              </div>
                          ) : <div className="text-[10px] text-slate-300 italic">No Signature</div>}
                      </div>
                   </div>
                </div>
               ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FaceSearchView: React.FC<{ entries: ClientEntry[], hasBg: boolean }> = ({ entries, hasBg }) => {
  const [scannedImage, setScannedImage] = useState<string | null>(null);
  const [resultId, setResultId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async (image: string) => {
    setScannedImage(image);
    setLoading(true);
    setError(null);
    setResultId(null);
    
    // Prepare candidates (filter only those with photos)
    const candidates = entries
      .filter(e => e.clientPhoto)
      .map(e => ({ id: e.id, name: e.clientName, photo: e.clientPhoto! }));

    if (candidates.length === 0) {
      setError("No clients with photos in the ledger yet.");
      setLoading(false);
      return;
    }

    const matchId = await findMatchingFace(image, candidates);
    
    if (matchId) {
      setResultId(matchId);
    } else {
      setError("No matching client found.");
    }
    setLoading(false);
  };

  const matchedEntry = resultId ? entries.find(e => e.id === resultId) : null;

  return (
    <div className={`${hasBg ? 'glass-panel' : 'bg-white'} rounded-2xl shadow-lg p-6`}>
       <h2 className="font-bold text-xl mb-4 text-slate-800 flex items-center gap-2">
         <FaceScanIcon className="w-6 h-6 text-indigo-600" /> Face Search
       </h2>
       
       {!scannedImage ? (
         <div className="mb-6">
           <p className="text-sm text-slate-500 mb-3">Scan a client's face to find their previous records.</p>
           <CameraCapture onCapture={handleScan} label="Scan Face" />
         </div>
       ) : (
         <div className="mb-6 flex flex-col items-center">
            <img src={scannedImage} className="w-32 h-32 rounded-full object-cover border-4 border-indigo-100 mb-4" />
            <button onClick={() => { setScannedImage(null); setResultId(null); setError(null); }} className="text-indigo-600 text-sm font-bold hover:underline">Scan Again</button>
         </div>
       )}

       {loading && (
         <div className="text-center py-8">
           <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent mb-2"></div>
           <p className="text-slate-500 font-medium">Identifying Client...</p>
         </div>
       )}

       {error && (
         <div className="bg-red-50 text-red-800 p-4 rounded-lg border border-red-100 text-center font-medium">
           {error}
         </div>
       )}

       {matchedEntry && (
         <div className="animate-[fadeIn_0.5s_ease-out]">
           <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-2">
             <div className="flex items-center gap-2 text-green-800 font-bold mb-1">
               <CheckIcon className="w-5 h-5" /> Match Found!
             </div>
           </div>
           
           <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-4 mb-4">
                 {matchedEntry.clientPhoto && <img src={matchedEntry.clientPhoto} className="w-16 h-16 rounded-lg object-cover" />}
                 <div>
                   <h3 className="font-bold text-lg">{matchedEntry.clientName}</h3>
                   <p className="text-sm text-slate-500">{matchedEntry.phone}</p>
                   <p className="text-xs text-slate-400">{new Date(matchedEntry.timestamp).toLocaleDateString()}</p>
                 </div>
              </div>
              <div className="text-sm bg-slate-50 p-3 rounded text-slate-700">
                {matchedEntry.servicePlan}
              </div>
           </div>
         </div>
       )}
    </div>
  );
};

export default App;