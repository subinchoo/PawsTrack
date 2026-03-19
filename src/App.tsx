import React, { useState, useEffect, useMemo, Component, ReactNode } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  FirebaseUser,
  OperationType,
  handleFirestoreError,
  setDoc,
  doc,
  getDoc,
  deleteDoc,
  where,
  limit
} from './firebase';
import { 
  Dog, 
  History, 
  Plus, 
  LogOut, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Calendar,
  User,
  Users,
  Trash2,
  ChevronRight,
  Info,
  Edit2,
  Settings as SettingsIcon,
  Share2,
  X,
  Utensils,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Walk {
  id: string;
  groupId: string;
  walkerUid: string;
  walkerName: string;
  timestamp: Timestamp;
  didPoop: boolean;
  didPee: boolean;
  notes: string;
}

interface DogInfo {
  id: string;
  groupId: string;
  name: string;
  photoURL?: string;
}

interface Feeding {
  id: string;
  groupId: string;
  feederUid: string;
  feederName: string;
  timestamp: Timestamp;
  amount: string;
  notes: string;
  photoURL?: string;
}

interface Group {
  id: string;
  name: string;
  ownerUid: string;
  members: string[];
  createdAt: Timestamp;
}

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = parsed.error;
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-red-50">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-100 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Error</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Main App Component ---
function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [userGroups, setUserGroups] = useState<Group[]>([]);
  const [walks, setWalks] = useState<Walk[]>([]);
  const [feedings, setFeedings] = useState<Feeding[]>([]);
  const [dogInfo, setDogInfo] = useState<DogInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLogging, setIsLogging] = useState(false);
  const [isFeeding, setIsFeeding] = useState(false);
  const [isEditingDog, setIsEditingDog] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isJoiningGroup, setIsJoiningGroup] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [joinGroupIdInput, setJoinGroupIdInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string, type: 'walk' | 'feeding' } | null>(null);
  const [selectedWalk, setSelectedWalk] = useState<Walk | null>(null);
  const [selectedFeeding, setSelectedFeeding] = useState<Feeding | null>(null);
  const [dogNameInput, setDogNameInput] = useState('');
  const [dogPhotoInput, setDogPhotoInput] = useState('');
  const [showShareToast, setShowShareToast] = useState(false);
  const [showGroupInviteToast, setShowGroupInviteToast] = useState(false);
  const [formData, setFormData] = useState({
    didPoop: false,
    didPee: true,
    notes: '',
    useManualTime: false,
    manualDate: new Date().toISOString().split('T')[0],
    manualTime: new Date().toTimeString().slice(0, 5)
  });
  const [feedingData, setFeedingData] = useState({
    amount: '',
    notes: '',
    photoURL: '',
    useManualTime: false,
    manualDate: new Date().toISOString().split('T')[0],
    manualTime: new Date().toTimeString().slice(0, 5)
  });

  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Ensure user profile exists
        try {
          await setDoc(doc(db, 'users', u.uid), {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            createdAt: Timestamp.now()
          }, { merge: true });
        } catch (err) {
          console.error("Error updating user profile:", err);
        }
      } else {
        setCurrentGroup(null);
        setCurrentGroupId(null);
        setUserGroups([]);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // User Profile Listener (to get currentGroupId)
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setCurrentGroupId(data.currentGroupId || null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });
    return unsubscribe;
  }, [user]);

  // User Groups Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'groups'), where('members', 'array-contains', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const groups: Group[] = [];
      snapshot.forEach((doc) => {
        groups.push({ id: doc.id, ...doc.data() } as Group);
      });
      setUserGroups(groups);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'groups');
    });
    return unsubscribe;
  }, [user]);

  // Current Group Listener
  useEffect(() => {
    if (!currentGroupId) {
      setCurrentGroup(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, 'groups', currentGroupId), (doc) => {
      if (doc.exists()) {
        setCurrentGroup({ id: doc.id, ...doc.data() } as Group);
      } else {
        setCurrentGroup(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `groups/${currentGroupId}`);
    });
    return unsubscribe;
  }, [currentGroupId]);

  // Dog Info Listener
  useEffect(() => {
    if (!user || !currentGroup) return;
    const q = query(collection(db, 'dogs'), where('groupId', '==', currentGroup.id), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = { id: doc.id, ...doc.data() } as DogInfo;
        setDogInfo(data);
        setDogNameInput(data.name);
        setDogPhotoInput(data.photoURL || '');
      } else {
        setDogInfo(null);
        setDogNameInput('');
        setDogPhotoInput('');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'dogs');
    });
    return unsubscribe;
  }, [user, currentGroup]);

  // Walks Listener
  useEffect(() => {
    if (!user || !currentGroup) return;

    const q = query(
      collection(db, 'walks'), 
      where('groupId', '==', currentGroup.id),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const walkList: Walk[] = [];
      snapshot.forEach((doc) => {
        walkList.push({ id: doc.id, ...doc.data() } as Walk);
      });
      setWalks(walkList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'walks');
    });

    return unsubscribe;
  }, [user, currentGroup]);

  // Feedings Listener
  useEffect(() => {
    if (!user || !currentGroup) return;

    const q = query(
      collection(db, 'feedings'), 
      where('groupId', '==', currentGroup.id),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feedingList: Feeding[] = [];
      snapshot.forEach((doc) => {
        feedingList.push({ id: doc.id, ...doc.data() } as Feeding);
      });
      setFeedings(feedingList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'feedings');
    });

    return unsubscribe;
  }, [user, currentGroup]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login Error:", err);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !groupNameInput.trim()) return;
    try {
      const groupRef = doc(collection(db, 'groups'));
      await setDoc(groupRef, {
        id: groupRef.id,
        name: groupNameInput,
        ownerUid: user.uid,
        members: [user.uid],
        createdAt: Timestamp.now()
      });
      // Set as current group for user
      await setDoc(doc(db, 'users', user.uid), { currentGroupId: groupRef.id }, { merge: true });
      setIsCreatingGroup(false);
      setGroupNameInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'groups');
    }
  };

  const handleJoinGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinGroupIdInput.trim()) return;
    try {
      const groupRef = doc(db, 'groups', joinGroupIdInput.trim());
      const groupSnap = await getDoc(groupRef);
      if (groupSnap.exists()) {
        const groupData = groupSnap.data();
        if (!groupData.members.includes(user.uid)) {
          await setDoc(groupRef, {
            members: [...groupData.members, user.uid]
          }, { merge: true });
        }
        await setDoc(doc(db, 'users', user.uid), { currentGroupId: groupRef.id }, { merge: true });
        setIsJoiningGroup(false);
        setJoinGroupIdInput('');
      } else {
        alert("Group not found. Please check the ID.");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `groups/${joinGroupIdInput}`);
    }
  };

  const handleSwitchGroup = async (groupId: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), { currentGroupId: groupId }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleCopyGroupId = () => {
    if (!currentGroup) return;
    navigator.clipboard.writeText(currentGroup.id);
    setShowGroupInviteToast(true);
    setTimeout(() => setShowGroupInviteToast(false), 3000);
  };

  const isAdmin = useMemo(() => {
    return user?.email === 'sbnin55@gmail.com';
  }, [user]);

  const handleShare = () => {
    const url = window.location.origin;
    navigator.clipboard.writeText(url);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 3000);
  };

  const handleDeleteWalk = async (walkId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await deleteDoc(doc(db, 'walks', walkId));
      if (selectedWalk?.id === walkId) setSelectedWalk(null);
      setConfirmDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `walks/${walkId}`);
    }
  };

  const handleUpdateDogName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentGroup || !dogNameInput.trim()) return;
    try {
      if (dogInfo?.id) {
        await setDoc(doc(db, 'dogs', dogInfo.id), {
          name: dogNameInput,
          photoURL: dogPhotoInput || null,
          updatedBy: user.uid,
          groupId: currentGroup.id
        }, { merge: true });
      } else {
        await addDoc(collection(db, 'dogs'), {
          name: dogNameInput,
          photoURL: dogPhotoInput || null,
          updatedBy: user.uid,
          groupId: currentGroup.id
        });
      }
      setIsEditingDog(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'dogs');
    }
  };

  const handleLogFeeding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentGroup || !feedingData.amount.trim()) return;

    let feedingTimestamp = Timestamp.now();
    if (feedingData.useManualTime) {
      const dateObj = new Date(`${feedingData.manualDate}T${feedingData.manualTime}`);
      feedingTimestamp = Timestamp.fromDate(dateObj);
    }

    try {
      await addDoc(collection(db, 'feedings'), {
        groupId: currentGroup.id,
        feederUid: user.uid,
        feederName: user.displayName || 'Roommate',
        timestamp: feedingTimestamp,
        amount: feedingData.amount,
        notes: feedingData.notes,
        photoURL: feedingData.photoURL || null
      });
      setIsFeeding(false);
      setFeedingData({
        amount: '',
        notes: '',
        photoURL: '',
        useManualTime: false,
        manualDate: new Date().toISOString().split('T')[0],
        manualTime: new Date().toTimeString().slice(0, 5)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'feedings');
    }
  };

  const handleDeleteFeeding = async (feedingId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await deleteDoc(doc(db, 'feedings', feedingId));
      if (selectedFeeding?.id === feedingId) setSelectedFeeding(null);
      setConfirmDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `feedings/${feedingId}`);
    }
  };

  const handleLogWalk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentGroup) return;

    let walkTimestamp = Timestamp.now();
    if (formData.useManualTime) {
      const dateObj = new Date(`${formData.manualDate}T${formData.manualTime}`);
      walkTimestamp = Timestamp.fromDate(dateObj);
    }

    try {
      await addDoc(collection(db, 'walks'), {
        groupId: currentGroup.id,
        walkerUid: user.uid,
        walkerName: user.displayName || 'Roommate',
        timestamp: walkTimestamp,
        didPoop: formData.didPoop,
        didPee: formData.didPee,
        notes: formData.notes
      });
      setIsLogging(false);
      setFormData({ 
        didPoop: false, 
        didPee: true, 
        notes: '', 
        useManualTime: false,
        manualDate: new Date().toISOString().split('T')[0],
        manualTime: new Date().toTimeString().slice(0, 5)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'walks');
    }
  };

  const lastWalk = walks[0];
  const lastFeeding = feedings[0];

  const timeSinceLastWalk = useMemo(() => {
    if (!lastWalk) return null;
    const diff = Date.now() - lastWalk.timestamp.toMillis();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
  }, [lastWalk]);

  const timeSinceLastFeeding = useMemo(() => {
    if (!lastFeeding) return null;
    const diff = Date.now() - lastFeeding.timestamp.toMillis();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
  }, [lastFeeding]);

  const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Quality 0.7 usually keeps 1024px images under 200KB
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'dog' | 'meal') => {
    const file = e.target.files?.[0];
    if (file) {
      // Allow up to 10MB for the initial selection, we will resize it
      if (file.size > 10 * 1024 * 1024) {
        alert("File is too large. Please choose an image under 10MB.");
        return;
      }
      
      const resizedDataUrl = await resizeImage(file);
      if (type === 'dog') setDogPhotoInput(resizedDataUrl);
      else setFeedingData({ ...feedingData, photoURL: resizedDataUrl });
    }
  };

  const getStatusColor = () => {
    if (!timeSinceLastWalk) return 'bg-gray-100 text-gray-500';
    if (timeSinceLastWalk.hours >= 6) return 'bg-red-100 text-red-600';
    if (timeSinceLastWalk.hours >= 4) return 'bg-orange-100 text-orange-600';
    return 'bg-emerald-100 text-emerald-600';
  };

  const [isIframe, setIsIframe] = useState(false);

  useEffect(() => {
    setIsIframe(window.self !== window.top);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Dog className="w-12 h-12 text-emerald-600" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center"
        >
          <div className="bg-emerald-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-200">
            <Dog className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">PawsTrack</h1>
          <p className="text-gray-600 mb-10">
            The shared log for your dog's walks and feedings.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full bg-emerald-600 text-white font-bold py-4 px-6 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <User className="w-6 h-6" />
            Sign in with Google
          </button>
          
          {isIframe && (
            <p className="mt-6 text-xs text-gray-400">
              If login is blocked, try opening in a new tab.
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  if (!currentGroup) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full"
        >
          <div className="bg-emerald-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-200">
            <Dog className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">Welcome to PawsTrack</h1>
          <p className="text-gray-600 mb-10 text-center">
            Create a household for your dog or join one started by your roommates.
          </p>

          <div className="space-y-4">
            <button 
              onClick={() => setIsCreatingGroup(true)}
              className="w-full flex items-center justify-center gap-3 bg-emerald-600 text-white font-bold py-4 px-6 rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all active:scale-95"
            >
              <Plus className="w-6 h-6" />
              Create a Household
            </button>
            <button 
              onClick={() => setIsJoiningGroup(true)}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 text-gray-700 font-bold py-4 px-6 rounded-2xl shadow-sm hover:bg-gray-50 transition-all active:scale-95"
            >
              <ChevronRight className="w-6 h-6" />
              Join with Group ID
            </button>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-3 text-gray-400 font-medium py-4 px-6 rounded-2xl hover:text-gray-600 transition-all"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </motion.div>

        {/* Create Group Modal */}
        <AnimatePresence>
          {isCreatingGroup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsCreatingGroup(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-6">New Household</h2>
                <form onSubmit={handleCreateGroup} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Household Name</label>
                    <input 
                      type="text" 
                      value={groupNameInput}
                      onChange={(e) => setGroupNameInput(e.target.value)}
                      placeholder="e.g. The Smith House"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsCreatingGroup(false)}
                      className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700"
                    >
                      Create
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Join Group Modal */}
        <AnimatePresence>
          {isJoiningGroup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsJoiningGroup(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Join Household</h2>
                <form onSubmit={handleJoinGroup} className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Group ID</label>
                    <input 
                      type="text" 
                      value={joinGroupIdInput}
                      onChange={(e) => setJoinGroupIdInput(e.target.value)}
                      placeholder="Paste ID from roommate"
                      className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 font-medium"
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    <button 
                      type="button"
                      onClick={() => setIsJoiningGroup(false)}
                      className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-100 hover:bg-emerald-700"
                    >
                      Join
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 p-2 rounded-xl overflow-hidden w-10 h-10 flex items-center justify-center">
              {dogInfo?.photoURL ? (
                <img src={dogInfo.photoURL} alt="Dog" className="w-full h-full object-cover" />
              ) : (
                <Dog className="w-6 h-6 text-emerald-600" />
              )}
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-gray-900 leading-tight">PawsTrack</span>
                <div className="h-4 w-[1px] bg-gray-200 mx-1" />
                <div className="relative group/group-switcher">
                  <button className="flex items-center gap-1 text-xs font-bold text-gray-400 uppercase tracking-widest hover:text-emerald-600 transition-colors">
                    {currentGroup.name}
                    {userGroups.length > 1 && <ChevronRight className="w-3 h-3 rotate-90" />}
                  </button>
                  {userGroups.length > 1 && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 opacity-0 invisible group-hover/group-switcher:opacity-100 group-hover/group-switcher:visible transition-all z-50">
                      <p className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Switch Household</p>
                      {userGroups.map(g => (
                        <button 
                          key={g.id}
                          onClick={() => handleSwitchGroup(g.id)}
                          className={`w-full text-left px-4 py-2 text-sm font-medium hover:bg-emerald-50 transition-colors ${g.id === currentGroup.id ? 'text-emerald-600 bg-emerald-50/50' : 'text-gray-600'}`}
                        >
                          {g.name}
                        </button>
                      ))}
                      <div className="border-t border-gray-50 mt-2 pt-2">
                        <button 
                          onClick={() => setIsCreatingGroup(true)}
                          className="w-full text-left px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> New Household
                        </button>
                        <button 
                          onClick={() => setIsJoiningGroup(true)}
                          className="w-full text-left px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <ChevronRight className="w-4 h-4" /> Join Household
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setIsEditingDog(true)}
                className="text-xs text-emerald-600 font-medium flex items-center gap-1 hover:text-emerald-700"
              >
                {dogInfo?.name || 'Add Dog Profile'} <Edit2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleCopyGroupId}
              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
              title="Copy Group ID to invite roommates"
            >
              <Users className="w-5 h-5" />
            </button>
            <button 
              onClick={handleShare}
              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
              title="Share App"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 pt-8 space-y-8">
        {/* Status Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Last Walk
                </h2>
                <p className="text-xl font-bold text-gray-900">
                  {lastWalk ? (
                    timeSinceLastWalk?.hours === 0 ? 'Recently' : `${timeSinceLastWalk?.hours}h ${timeSinceLastWalk?.minutes}m ago`
                  ) : 'None'}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${getStatusColor()}`}>
                {timeSinceLastWalk && timeSinceLastWalk.hours >= 6 ? 'Needs Walk' : 'Good'}
              </div>
            </div>
            {lastWalk && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <User className="w-3 h-3" />
                <span className="truncate">{lastWalk.walkerName}</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                  Last Feeding
                </h2>
                <p className="text-xl font-bold text-gray-900">
                  {lastFeeding ? (
                    timeSinceLastFeeding?.hours === 0 ? 'Recently' : `${timeSinceLastFeeding?.hours}h ${timeSinceLastFeeding?.minutes}m ago`
                  ) : 'None'}
                </p>
              </div>
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${timeSinceLastFeeding && timeSinceLastFeeding.hours >= 8 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {timeSinceLastFeeding && timeSinceLastFeeding.hours >= 8 ? 'Hungry' : 'Full'}
              </div>
            </div>
            {lastFeeding && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Utensils className="w-3 h-3" />
                <span className="truncate">{lastFeeding.amount} by {lastFeeding.feederName}</span>
              </div>
            )}
          </div>
        </section>

        {/* Dog Profile Card */}
        <section>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-24 h-24 rounded-2xl bg-gray-100 overflow-hidden flex-shrink-0 border-2 border-emerald-50 shadow-inner">
              {dogInfo?.photoURL ? (
                <img src={dogInfo.photoURL} alt="Dog" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <Dog className="w-10 h-10" />
                </div>
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{dogInfo?.name || 'Your Dog'}</h2>
              <div className="flex flex-wrap justify-center sm:justify-start gap-3 mb-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full">
                  <Clock className="w-3 h-3 text-emerald-500" />
                  {walks.filter(w => w.timestamp.toDate().toDateString() === new Date().toDateString()).length} walks today
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full">
                  <Utensils className="w-3 h-3 text-orange-500" />
                  {feedings.filter(f => f.timestamp.toDate().toDateString() === new Date().toDateString()).length} meals today
                </div>
              </div>
              <button 
                onClick={() => setIsEditingDog(true)}
                className="text-xs bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-bold hover:bg-emerald-100 transition-colors"
              >
                Edit Profile
              </button>
            </div>
          </div>
        </section>

        {/* History Tabs */}
        <section className="space-y-4">
          <div className="flex items-center gap-4 border-b border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 pb-2 border-b-2 border-emerald-600 flex items-center gap-2">
              Activity History
            </h3>
          </div>

          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {[...walks.map(w => ({ ...w, type: 'walk' })), ...feedings.map(f => ({ ...f, type: 'feeding' }))]
                .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
                .slice(0, 20)
                .map((item: any) => (
                <motion.div 
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  onClick={() => item.type === 'walk' ? setSelectedWalk(item) : setSelectedFeeding(item)}
                  className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between group cursor-pointer hover:border-emerald-200 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.type === 'walk' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                      {item.type === 'walk' ? <Clock className="w-5 h-5" /> : <Utensils className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900 text-sm">{item.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        <span className="text-gray-300">•</span>
                        <p className="text-xs text-gray-500">{item.timestamp.toDate().toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        {item.type === 'walk' ? 'Walked' : `Fed ${item.amount}`} by <span className="font-medium text-gray-700">{item.type === 'walk' ? item.walkerName : item.feederName}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.photoURL && <ImageIcon className="w-4 h-4 text-emerald-400" />}
                    {(isAdmin || user.uid === (item.type === 'walk' ? item.walkerUid : item.feederUid)) && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDelete({ id: item.id, type: item.type });
                        }}
                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <ChevronRight className="w-5 h-5 text-gray-200" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </section>
      </main>

      {/* Action Buttons */}
      <div className="fixed bottom-8 left-0 right-0 px-6 max-w-2xl mx-auto flex gap-3">
        <button 
          onClick={() => setIsFeeding(true)}
          className="flex-1 bg-white border border-emerald-100 text-emerald-600 font-bold py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Utensils className="w-5 h-5" />
          Feed
        </button>
        <button 
          onClick={() => setIsLogging(true)}
          className="flex-[2] bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Plus className="w-6 h-6" />
          Log Walk
        </button>
      </div>

      {/* Log Modal */}
      <AnimatePresence>
        {isLogging && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogging(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Log New Walk</h2>
              <form onSubmit={handleLogWalk} className="space-y-6">
                <div className="space-y-4">
                  {/* Manual Time Toggle */}
                  <div className="bg-gray-50 p-4 rounded-2xl space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold text-gray-700">Log past walk?</span>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={formData.useManualTime}
                        onChange={(e) => setFormData({ ...formData, useManualTime: e.target.checked })}
                      />
                      <div className={`w-12 h-6 rounded-full relative transition-colors ${formData.useManualTime ? 'bg-emerald-600' : 'bg-gray-300'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.useManualTime ? 'translate-x-6' : 'translate-x-0'}`} />
                      </div>
                    </label>
                    
                    {formData.useManualTime && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="grid grid-cols-2 gap-2 pt-2"
                      >
                        <input 
                          type="date" 
                          value={formData.manualDate}
                          onChange={(e) => setFormData({ ...formData, manualDate: e.target.value })}
                          className="bg-white border border-gray-200 rounded-xl p-2 text-sm"
                        />
                        <input 
                          type="time" 
                          value={formData.manualTime}
                          onChange={(e) => setFormData({ ...formData, manualTime: e.target.value })}
                          className="bg-white border border-gray-200 rounded-xl p-2 text-sm"
                        />
                      </motion.div>
                    )}
                  </div>

                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${formData.didPoop ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400 border border-gray-200'}`}>
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-gray-700">Did they poop?</span>
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={formData.didPoop}
                      onChange={(e) => setFormData({ ...formData, didPoop: e.target.checked })}
                    />
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${formData.didPoop ? 'bg-emerald-600' : 'bg-gray-300'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.didPoop ? 'translate-x-6' : 'translate-x-0'}`} />
                    </div>
                  </label>

                  <label className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${formData.didPee ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400 border border-gray-200'}`}>
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <span className="font-semibold text-gray-700">Did they pee?</span>
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={formData.didPee}
                      onChange={(e) => setFormData({ ...formData, didPee: e.target.checked })}
                    />
                    <div className={`w-12 h-6 rounded-full relative transition-colors ${formData.didPee ? 'bg-emerald-600' : 'bg-gray-300'}`}>
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${formData.didPee ? 'translate-x-6' : 'translate-x-0'}`} />
                    </div>
                  </label>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 ml-1">Notes (optional)</label>
                    <textarea 
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="e.g. Met a squirrel, very energetic!"
                      className="w-full bg-gray-50 border-none rounded-2xl p-4 text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 min-h-[100px] resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsLogging(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors"
                  >
                    Save Walk
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dog Name Modal */}
      <AnimatePresence>
        {isEditingDog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingDog(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Dog Profile</h2>
              <form onSubmit={handleUpdateDogName} className="space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group">
                      {dogPhotoInput ? (
                        <>
                          <img src={dogPhotoInput} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDogPhotoInput(''); }}
                            className="absolute top-1 right-1 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <Camera className="w-8 h-8 text-gray-300" />
                      )}
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'dog')}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Tap to change photo</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 ml-1">Dog's Name</label>
                    <input 
                      type="text" 
                      value={dogNameInput}
                      onChange={(e) => setDogNameInput(e.target.value)}
                      placeholder="e.g. Buddy"
                      className="w-full bg-gray-50 border-none rounded-2xl p-4 text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsEditingDog(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors"
                  >
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feeding Modal */}
      <AnimatePresence>
        {isFeeding && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFeeding(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative bg-white w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Log Feeding</h2>
              <form onSubmit={handleLogFeeding} className="space-y-6">
                <div className="space-y-4">
                  {/* Manual Time Toggle */}
                  <div className="bg-gray-50 p-4 rounded-2xl space-y-3">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="font-semibold text-gray-700 text-sm">Log past feeding?</span>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={feedingData.useManualTime}
                        onChange={(e) => setFeedingData({ ...feedingData, useManualTime: e.target.checked })}
                      />
                      <div className={`w-12 h-6 rounded-full relative transition-colors ${feedingData.useManualTime ? 'bg-emerald-600' : 'bg-gray-300'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${feedingData.useManualTime ? 'translate-x-6' : 'translate-x-0'}`} />
                      </div>
                    </label>
                    
                    {feedingData.useManualTime && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="grid grid-cols-2 gap-2 pt-2"
                      >
                        <input 
                          type="date" 
                          value={feedingData.manualDate}
                          onChange={(e) => setFeedingData({ ...feedingData, manualDate: e.target.value })}
                          className="bg-white border border-gray-200 rounded-xl p-2 text-xs"
                        />
                        <input 
                          type="time" 
                          value={feedingData.manualTime}
                          onChange={(e) => setFeedingData({ ...feedingData, manualTime: e.target.value })}
                          className="bg-white border border-gray-200 rounded-xl p-2 text-xs"
                        />
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 ml-1">Amount</label>
                    <input 
                      type="text" 
                      value={feedingData.amount}
                      onChange={(e) => setFeedingData({ ...feedingData, amount: e.target.value })}
                      placeholder="e.g. 1 cup kibble"
                      className="w-full bg-gray-50 border-none rounded-2xl p-4 text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 ml-1">Meal Photo (optional)</label>
                    <div className="w-full h-40 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center relative overflow-hidden group">
                      {feedingData.photoURL ? (
                        <>
                          <img src={feedingData.photoURL} alt="Meal" className="w-full h-full object-cover" />
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFeedingData({ ...feedingData, photoURL: '' }); }}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <Camera className="w-8 h-8 text-gray-300 mb-2" />
                          <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Tap to add photo</span>
                        </>
                      )}
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => handleFileChange(e, 'meal')}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-500 ml-1">Notes (optional)</label>
                    <textarea 
                      value={feedingData.notes}
                      onChange={(e) => setFeedingData({ ...feedingData, notes: e.target.value })}
                      placeholder="e.g. Ate it all very fast!"
                      className="w-full bg-gray-50 border-none rounded-2xl p-4 text-gray-700 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 min-h-[80px] resize-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsFeeding(false)}
                    className="flex-1 py-4 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors"
                  >
                    Save Feeding
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {(selectedWalk || selectedFeeding) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedWalk(null); setSelectedFeeding(null); }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-6">
                <h2 className="text-2xl font-bold text-gray-900">{selectedWalk ? 'Walk Details' : 'Feeding Details'}</h2>
                <button onClick={() => { setSelectedWalk(null); setSelectedFeeding(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {selectedFeeding?.photoURL && (
                <div className="w-full h-48 rounded-2xl overflow-hidden mb-6 border border-gray-100">
                  <img src={selectedFeeding.photoURL} alt="Meal" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selectedWalk ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                    {selectedWalk ? <User className="w-6 h-6" /> : <Utensils className="w-6 h-6" />}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{selectedWalk ? 'Walker' : 'Feeder'}</p>
                    <p className="text-lg font-bold text-gray-900">{selectedWalk ? selectedWalk.walkerName : selectedFeeding?.feederName}</p>
                  </div>
                </div>

                {selectedFeeding && (
                  <div className="p-4 bg-orange-50 rounded-2xl">
                    <p className="text-xs text-orange-600 font-medium uppercase tracking-wider mb-1">Amount</p>
                    <p className="text-lg font-bold text-orange-900">{selectedFeeding.amount}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Date</p>
                    <p className="font-bold text-gray-900">{(selectedWalk || selectedFeeding)?.timestamp.toDate().toLocaleDateString()}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Time</p>
                    <p className="font-bold text-gray-900">{(selectedWalk || selectedFeeding)?.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>

                {selectedWalk && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className={`p-4 rounded-2xl flex items-center gap-3 ${selectedWalk.didPoop ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-bold">Pooped</span>
                    </div>
                    <div className={`p-4 rounded-2xl flex items-center gap-3 ${selectedWalk.didPee ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-400'}`}>
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-bold">Peed</span>
                    </div>
                  </div>
                )}

                {(selectedWalk || selectedFeeding)?.notes && (
                  <div className="p-4 bg-gray-50 rounded-2xl">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Notes</p>
                    <p className="text-gray-700 leading-relaxed">{(selectedWalk || selectedFeeding)?.notes}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {(isAdmin || user.uid === (selectedWalk ? selectedWalk.walkerUid : selectedFeeding?.feederUid)) && (
                    <button 
                      onClick={() => setConfirmDelete({ id: (selectedWalk || selectedFeeding)!.id, type: selectedWalk ? 'walk' : 'feeding' })}
                      className="flex-1 py-4 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-5 h-5" />
                      Delete
                    </button>
                  )}
                  <button 
                    onClick={() => { setSelectedWalk(null); setSelectedFeeding(null); }}
                    className="flex-[2] py-4 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Delete Log?</h2>
              <p className="text-gray-500 text-sm mb-8">This action cannot be undone. Are you sure you want to delete this {confirmDelete.type} log?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => confirmDelete.type === 'walk' ? handleDeleteWalk(confirmDelete.id) : handleDeleteFeeding(confirmDelete.id)}
                  className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-100 hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Share Toast */}
      <AnimatePresence>
        {showShareToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium">Link copied! Share with roommates.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Group Invite Toast */}
      <AnimatePresence>
        {showGroupInviteToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium">Group ID copied! Send to roommates.</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
