import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Plus, UploadCloud, Users, Briefcase, Settings, X, 
  Loader2, CheckCircle, AlertCircle, File, ChevronRight, Trash2, 
  Search, Check, ShieldCheck, Download, Copy, AlertTriangle, Edit2,
  Moon, Sun
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Types
type Profile = {
  id: string;
  name: string;
  jobTitle: string;
  experience: string;
  skills: string;
  additionalCriteria: string;
};

type EvaluationStatus = 'idle' | 'evaluating' | 'success' | 'error';

type CandidateResult = {
  id: string;
  profileId: string;
  file: File;
  status: EvaluationStatus;
  candidateName?: string;
  score?: number;
  strengths?: string[];
  weaknesses?: string[];
  summary?: string;
  error?: string;
};

// --- Helper for File to Base64 ---
const fileToGenerativePart = async (file: File) => {
  return new Promise<{inlineData: {data: string, mimeType: string}}>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve({
          inlineData: {
            data: base64,
            mimeType: file.type
          }
        });
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const saved = localStorage.getItem('hr-profiles');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [activeProfileId, setActiveProfileId] = useState<string | null>(profiles.length > 0 ? profiles[0].id : null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(profiles.length === 0);
  
  const [candidates, setCandidates] = useState<CandidateResult[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  
  // Profile form state
  const [editingProfile, setEditingProfile] = useState<Partial<Profile>>({});

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('hr-profiles', JSON.stringify(profiles));
  }, [profiles]);

  const activeProfile = profiles.find(p => p.id === activeProfileId);
  const profileCandidates = candidates.filter(c => c.profileId === activeProfileId);
  const selectedCandidateInfo = candidates.find(c => c.id === selectedCandidateId);

  const handleSaveProfile = () => {
    if (!editingProfile.name || !editingProfile.jobTitle) return;
    
    if (editingProfile.id) {
      setProfiles(profiles.map(p => p.id === editingProfile.id ? editingProfile as Profile : p));
    } else {
      const newProfile: Profile = {
        id: crypto.randomUUID(),
        name: editingProfile.name,
        jobTitle: editingProfile.jobTitle,
        experience: editingProfile.experience || '',
        skills: editingProfile.skills || '',
        additionalCriteria: editingProfile.additionalCriteria || '',
      };
      setProfiles([...profiles, newProfile]);
      setActiveProfileId(newProfile.id);
    }
    setIsCreatingProfile(false);
    setEditingProfile({});
  };

  const handleCreateNew = () => {
    setEditingProfile({});
    setActiveProfileId(null);
    setIsCreatingProfile(true);
  };

  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newProfiles = profiles.filter(p => p.id !== id);
    setProfiles(newProfiles);
    if (activeProfileId === id) {
      setActiveProfileId(newProfiles.length > 0 ? newProfiles[0].id : null);
      if (newProfiles.length === 0) setIsCreatingProfile(true);
    }
  };

  // --- Upload & Evaluation Logic ---
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    const items = Array.from(e.dataTransfer.files as Iterable<File>);
    const files = items.filter((f: File) => 
      f.type === 'application/pdf' || 
      f.type === 'text/plain' || 
      f.name.endsWith('.pdf') || 
      f.name.endsWith('.txt')
    );
    processFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeProfile || !e.target.files) return;
    const files = Array.from(e.target.files as Iterable<File>);
    processFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFiles = (files: File[]) => {
    if (files.length === 0 || !activeProfile) return;
    
    const newCandidates: CandidateResult[] = files.map(file => ({
      id: crypto.randomUUID(),
      profileId: activeProfile.id,
      file,
      status: 'idle'
    }));
    
    setCandidates(prev => [...newCandidates, ...prev]);
    
    // Start evaluation
    newCandidates.forEach(candidate => {
      evaluateCandidate(candidate.id, candidate.file, activeProfile);
    });
  };

  const evaluateCandidate = async (candidateId: string, file: File, profile: Profile) => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, status: 'evaluating' } : c));
    
    try {
      const filePart = await fileToGenerativePart(file);
      
      const prompt = `You are an expert HR Technical Recruiter. Evaluate the provided CV document against the following job profile requirements:
      - Job Title: ${profile.jobTitle}
      - Required Experience: ${profile.experience}
      - Core Skills: ${profile.skills}
      - Additional Criteria: ${profile.additionalCriteria}
      
      Extract the candidate's name, give them a match score out of 100 based strictly on how well they fit the requirements, list their top strengths related to the job, list any weaknesses or missing requirements, and provide a short 2-3 sentence summary.
      Write the response in the same language of the CV if possible, or Arabic if requested by the user, but prefer returning clear, professional text. If the document is unreadable or not a CV, return score 0 and state that in the summary.`;

      const proResponse = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: { parts: [filePart, { text: prompt }] },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              candidateName: { type: Type.STRING },
              score: { type: Type.NUMBER, description: "Match score out of 100 based on requirements" },
              strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
              weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
              summary: { type: Type.STRING, description: "Quick summary of the candidate's fit" }
            },
            required: ["candidateName", "score", "strengths", "weaknesses", "summary"]
          }
        }
      });
      
      if (!proResponse.text) throw new Error("Empty response");
      
      const parsed = JSON.parse(proResponse.text.trim());
      
      setCandidates(prev => prev.map(c => c.id === candidateId ? { 
        ...c, 
        status: 'success',
        ...parsed
      } : c));

    } catch (err: any) {
      console.error(err);
      setCandidates(prev => prev.map(c => c.id === candidateId ? { 
        ...c, 
        status: 'error',
        error: err.message || "Failed to evaluate CV"
      } : c));
    }
  };

  const removeCandidate = (id: string, e?: React.MouseEvent) => {
    if(e) e.stopPropagation();
    setCandidates(prev => prev.filter(c => c.id !== id));
  };


  return (
    <div className="min-h-screen bg-[#f5f6f8] dark:bg-[#0f172a] font-sans text-gray-900 dark:text-gray-100 transition-colors duration-200 flex flex-col">
      
      {/* HEADER & TABS */}
      <header className="bg-[#1e2939] text-white pt-4 md:pt-6 sticky top-0 z-20 shadow-md">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 shadow-lg flex items-center justify-center text-orange-400">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h1 className="font-bold text-xl leading-tight tracking-tight text-white">ScreenHR</h1>
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">AI CV Evaluator</p>
              </div>
            </div>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg bg-[#2a374a]"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          <div className="flex space-x-2 overflow-x-auto scrollbar-none pb-0 mt-2 border-b border-[#2a374a]">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => {
                  setActiveProfileId(profile.id);
                  setIsCreatingProfile(false);
                }}
                className={`flex items-center px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors rounded-t-xl ${
                  activeProfileId === profile.id && !isCreatingProfile
                    ? 'border-orange-500 text-white bg-[#2a374a]' 
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#2a374a]/50'
                }`}
              >
                <Briefcase size={16} className="mr-2" />
                {profile.name}
              </button>
            ))}
            <button
              onClick={handleCreateNew}
              className={`flex items-center px-5 py-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors rounded-t-xl ${
                isCreatingProfile
                  ? 'border-orange-500 text-white bg-[#2a374a]' 
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-[#2a374a]/50'
              }`}
            >
              <Plus size={16} strokeWidth={2.5} className="mr-2" />
              New Profile
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-8 md:py-10">
        {isCreatingProfile || !activeProfile ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-[#1e293b] p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Edit2 size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create Screening Profile</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Define what you're looking for to guide the AI evaluator.</p>
                </div>
              </div>
              {activeProfile && (
                <button 
                  onClick={(e) => handleDeleteProfile(activeProfile.id, e)}
                  className="px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-xl transition-colors flex items-center"
                >
                  <Trash2 size={16} className="mr-2" />
                  Delete Profile
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Profile Name</label>
                <input 
                  type="text" 
                  placeholder="e.g., Senior React Dev..."
                  value={editingProfile.name || ''}
                  onChange={e => setEditingProfile({...editingProfile, name: e.target.value})}
                  className="w-full p-3.5 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-[#1e293b] focus:border-orange-500 dark:focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-900 transition-all outline-none text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Job Title</label>
                <input 
                  type="text" 
                  placeholder="e.g., Frontend Engineer"
                  value={editingProfile.jobTitle || ''}
                  onChange={e => setEditingProfile({...editingProfile, jobTitle: e.target.value})}
                  className="w-full p-3.5 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-[#1e293b] focus:border-orange-500 dark:focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-900 transition-all outline-none text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Required Experience</label>
                <input 
                  type="text" 
                  placeholder="e.g., 5+ years in React, minimum 2 years leading teams"
                  value={editingProfile.experience || ''}
                  onChange={e => setEditingProfile({...editingProfile, experience: e.target.value})}
                  className="w-full p-3.5 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-[#1e293b] focus:border-orange-500 dark:focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-900 transition-all outline-none text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Core Skills</label>
                <textarea 
                  placeholder="e.g., React, TypeScript, Tailwind, Node.js..."
                  rows={2}
                  value={editingProfile.skills || ''}
                  onChange={e => setEditingProfile({...editingProfile, skills: e.target.value})}
                  className="w-full p-3.5 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-[#1e293b] focus:border-orange-500 dark:focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-900 transition-all outline-none resize-none text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Additional Criteria & Nice-to-haves</label>
                <textarea 
                  placeholder="e.g., Open source contributions, Arabic speaking..."
                  rows={2}
                  value={editingProfile.additionalCriteria || ''}
                  onChange={e => setEditingProfile({...editingProfile, additionalCriteria: e.target.value})}
                  className="w-full p-3.5 bg-gray-50 dark:bg-[#0f172a] border border-gray-200 dark:border-gray-700 rounded-xl focus:bg-white dark:focus:bg-[#1e293b] focus:border-orange-500 dark:focus:border-orange-500 focus:ring-2 focus:ring-orange-200 dark:focus:ring-orange-900 transition-all outline-none resize-none text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end space-x-3">
              {profiles.length > 0 && (
                  <button 
                    onClick={() => {
                      setIsCreatingProfile(false);
                      if (activeProfileId === null && profiles.length > 0) setActiveProfileId(profiles[0].id);
                    }}
                    className="px-6 py-3 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
              )}
              <button 
                onClick={handleSaveProfile}
                disabled={!editingProfile.name || !editingProfile.jobTitle}
                className="px-8 py-3 bg-orange-600 dark:bg-orange-600 hover:bg-orange-700 dark:hover:bg-orange-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-orange-600/20 dark:shadow-orange-900/40 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                Save Profile
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={activeProfile.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            {/* Top Section: Profile Info & Upload */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Profile Details Card */}
              <div className="bg-white dark:bg-[#1e293b] p-6 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                    <Briefcase size={24} />
                  </div>
                  <button 
                    onClick={() => {
                      setEditingProfile(activeProfile);
                      setIsCreatingProfile(true);
                    }}
                    className="p-2 text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 bg-gray-50 dark:bg-[#0f172a] border border-gray-100 dark:border-gray-800 rounded-lg transition-colors"
                    title="Edit Profile"
                  >
                    <Edit2 size={16} />
                  </button>
                </div>
                
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{activeProfile.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-4">{activeProfile.jobTitle} • {activeProfile.experience}</p>
                
                <div className="mt-auto pt-4 border-t border-gray-100 dark:border-gray-800">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Core Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {activeProfile.skills.split(',').slice(0, 6).map((skill, i) => skill.trim() && (
                      <span key={i} className="px-2.5 py-1 bg-gray-100 dark:bg-[#0f172a] text-gray-600 dark:text-gray-300 text-xs font-semibold rounded-md border border-gray-200 dark:border-gray-800">
                        {skill.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div 
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className="lg:col-span-2 bg-white dark:bg-[#1e293b] border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-all rounded-3xl p-8 md:p-10 text-center cursor-pointer group flex flex-col items-center justify-center"
              >
                <input 
                  type="file" 
                  multiple 
                  accept=".pdf,.txt" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileInput}
                />
                <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <UploadCloud size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Upload Candidate CVs</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
                  Drag and drop PDF or text files here. You can upload multiple CVs at once to process them in parallel for this position.
                </p>
              </div>
            </div>

            {/* Candidates Grid */}
            {profileCandidates.length > 0 && (
              <div className="pt-4">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    Candidates <span className="text-orange-600 dark:text-orange-400 text-sm ml-2 font-semibold bg-orange-100 dark:bg-orange-900/30 px-2 py-0.5 rounded-full">{profileCandidates.length}</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <AnimatePresence>
                    {profileCandidates.map(candidate => (
                      <motion.div 
                        key={candidate.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-6 flex flex-col h-full transition-colors relative"
                      >
                        {candidate.status === 'evaluating' ? (
                          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                            <Loader2 size={32} className="animate-spin text-orange-500 mb-4" />
                            <p className="font-semibold text-gray-900 dark:text-white">{candidate.file.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Analyzing profile fit...</p>
                          </div>
                        ) : candidate.status === 'error' ? (
                          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                            <AlertTriangle size={32} className="text-red-500 mb-4" />
                            <p className="font-semibold text-gray-900 dark:text-white truncate w-full">{candidate.file.name}</p>
                            <p className="text-xs text-red-500 mt-2">{candidate.error}</p>
                            <button 
                              onClick={() => removeCandidate(candidate.id)}
                              className="mt-4 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <>
                            {/* Candidate Header */}
                            <div className="flex items-start justify-between mb-4">
                              <div className="min-w-0 flex-1 pr-4">
                                <h4 className="font-bold text-lg text-gray-900 dark:text-white line-clamp-1" title={candidate.candidateName}>
                                  {candidate.candidateName || 'Unknown Name'}
                                </h4>
                                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                  <File size={12} className="mr-1.5 shrink-0 text-orange-400" />
                                  <span className="truncate">{candidate.file.name}</span>
                                </div>
                              </div>
                              <div className="relative shrink-0 w-14 h-14 flex items-center justify-center bg-gray-50 dark:bg-[#0f172a] rounded-full shadow-inner border border-gray-100 dark:border-gray-800">
                                <svg viewBox="0 0 36 36" className="w-12 h-12 absolute inset-0 m-auto">
                                  <path
                                    className="text-gray-200 dark:text-gray-700"
                                    strokeWidth="3.5"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                  <path
                                    className={`${candidate.score && candidate.score >= 80 ? 'text-green-500' : candidate.score && candidate.score >= 50 ? 'text-orange-400' : 'text-red-500'}`}
                                    strokeWidth="3.5"
                                    strokeDasharray={`${candidate.score || 0}, 100`}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="none"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                </svg>
                                <span className="relative font-bold text-[13px] text-gray-900 dark:text-white">{candidate.score}</span>
                              </div>
                            </div>
                            
                            {/* Summary */}
                            <div className="mb-5 bg-orange-50/30 dark:bg-orange-900/5 p-3 rounded-xl border border-orange-100/50 dark:border-orange-900/10">
                              <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">
                                {candidate.summary}
                              </p>
                            </div>

                            {/* Key Points */}
                            <div className="mt-auto space-y-3 px-1">
                              {candidate.strengths && candidate.strengths.length > 0 && (
                                <div>
                                  <ul className="space-y-1.5">
                                    {candidate.strengths.slice(0, 2).map((s, i) => (
                                      <li key={`s-${i}`} className="text-[13px] text-gray-700 dark:text-gray-300 line-clamp-1 flex items-center">
                                        <CheckCircle size={14} className="text-green-500 mr-2.5 shrink-0" /> {s}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {candidate.weaknesses && candidate.weaknesses.length > 0 && (
                                <div>
                                  <ul className="space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-2">
                                    {candidate.weaknesses.slice(0, 1).map((w, i) => (
                                      <li key={`w-${i}`} className="text-[13px] text-gray-700 dark:text-gray-300 line-clamp-1 flex items-center">
                                        <AlertCircle size={14} className="text-red-500 mr-2.5 shrink-0" /> {w}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Card Footer */}
                            <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                              <button 
                                onClick={() => setSelectedCandidateId(candidate.id)} 
                                className="px-4 py-2 bg-gray-50 dark:bg-[#0f172a] hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-orange-600 dark:text-orange-400 text-sm font-semibold transition-colors flex-1 text-center"
                              >
                                View Full Report
                              </button>
                              <button 
                                onClick={() => removeCandidate(candidate.id)} 
                                className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-2 ml-2 bg-gray-50 dark:bg-[#0f172a] rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Remove candidate"
                              >
                                <Trash2 size={16}/>
                              </button>
                            </div>
                          </>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Candidate Detailed Modal */}
      <AnimatePresence>
        {selectedCandidateId && selectedCandidateInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pt-10 pb-10">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
              onClick={() => setSelectedCandidateId(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl max-h-[90vh] bg-white dark:bg-[#1e293b] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-gray-200 dark:border-gray-700"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-[#0f172a]">
                <div className="flex items-center">
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mr-4 text-orange-600 dark:text-orange-400">
                     <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white leading-tight">Candidate Report</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Detailed AI Analysis</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCandidateId(null)}
                  className="p-2 text-gray-400 hover:text-gray-900 dark:hover:text-white bg-white dark:bg-[#1e293b] border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 md:p-8 overflow-y-auto">
                <div className="flex flex-col md:flex-row md:items-start gap-8 mb-10">
                  {/* Score */}
                  <div className="shrink-0 mx-auto md:mx-0 flex flex-col items-center">
                    <div className="relative w-28 h-28 bg-white dark:bg-[#1e293b] rounded-full shadow-lg border border-gray-100 dark:border-gray-800 flex items-center justify-center">
                      <svg viewBox="0 0 36 36" className="w-[100px] h-[100px]">
                        <path
                          className="text-gray-100 dark:text-gray-800"
                          strokeWidth="3.5"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className={`${selectedCandidateInfo.score && selectedCandidateInfo.score >= 80 ? 'text-green-500' : selectedCandidateInfo.score && selectedCandidateInfo.score >= 50 ? 'text-orange-400' : 'text-red-500'}`}
                          strokeWidth="3.5"
                          strokeDasharray={`${selectedCandidateInfo.score || 0}, 100`}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="none"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span className="absolute inset-0 flex flex-col items-center justify-center font-bold text-3xl text-gray-900 dark:text-white">
                        {selectedCandidateInfo.score}
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest -mt-1 font-semibold">Match</span>
                      </span>
                    </div>
                  </div>

                  {/* Basic Info */}
                  <div className="flex-1 text-center md:text-left">
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">{selectedCandidateInfo.candidateName}</h2>
                    <div className="inline-flex items-center text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-[#0f172a] border border-gray-200 dark:border-gray-700 px-4 py-2 rounded-xl mb-5 shadow-sm">
                      <File size={16} className="mr-2 text-orange-500" />
                      {selectedCandidateInfo.file.name}
                    </div>
                    <div className="bg-orange-50/50 dark:bg-orange-900/10 p-5 rounded-2xl border border-orange-100/50 dark:border-orange-900/30">
                      <p className="text-sm md:text-base text-gray-800 dark:text-gray-200 leading-relaxed text-left">
                        {selectedCandidateInfo.summary}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <h5 className="text-sm font-bold text-green-700 dark:text-green-500 uppercase tracking-widest flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" /> Strengths & Fits
                    </h5>
                    <ul className="space-y-3">
                      {selectedCandidateInfo.strengths?.map((str, i) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start bg-gray-50 dark:bg-[#0f172a] p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                          <span className="text-green-500 dark:text-green-400 mr-3 mt-0.5">•</span>
                          <span className="leading-relaxed">{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-sm font-bold text-red-700 dark:text-red-400 uppercase tracking-widest flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2" /> Weaknesses & Gaps
                    </h5>
                    <ul className="space-y-3">
                      {selectedCandidateInfo.weaknesses?.length ? selectedCandidateInfo.weaknesses.map((weak, i) => (
                        <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start bg-gray-50 dark:bg-[#0f172a] p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                          <span className="text-red-500 dark:text-red-400 mr-3 mt-0.5">•</span>
                          <span className="leading-relaxed">{weak}</span>
                        </li>
                      )) : (
                        <li className="text-sm text-gray-500 dark:text-gray-400 italic bg-gray-50 dark:bg-[#0f172a] p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">No significant weaknesses found.</li>
                      )}
                    </ul>
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
