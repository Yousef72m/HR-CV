import React, { useEffect, useMemo, useState } from "react";
import {
  Upload,
  Briefcase,
  Trash2,
  Moon,
  Sun,
  Save,
  FileText,
  Star,
  Search,
  Filter,
  BarChart3,
  Download,
  Loader2,
  CheckCircle
} from "lucide-react";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

type Candidate = {
  id: string;
  name: string;
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  experience: string;
  skills: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
};

type JobProfile = {
  id: string;
  title: string;
  experience: string;
  skills: string;
  additional: string;
};

export default function App() {
  const [dark, setDark] = useState(false);

  const [profiles, setProfiles] = useState<JobProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");

  const [title, setTitle] = useState("");
  const [experience, setExperience] = useState("");
  const [skills, setSkills] = useState("");
  const [additional, setAdditional] = useState("");

  const [results, setResults] = useState<Record<string, Candidate[]>>({});
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filterScore, setFilterScore] = useState(0);

  // ==============================
  // LOAD STORAGE
  // ==============================
  useEffect(() => {
    const savedProfiles = localStorage.getItem("jobProfiles");
    const savedTheme = localStorage.getItem("theme");

    if (savedProfiles) {
      const parsed = JSON.parse(savedProfiles);
      setProfiles(parsed);

      if (parsed.length > 0) {
        setSelectedProfile(parsed[0].id);
      }
    }

    if (savedTheme === "dark") {
      setDark(true);
    }
  }, []);

  // ==============================
  // SAVE STORAGE
  // ==============================
  useEffect(() => {
    localStorage.setItem("jobProfiles", JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  // ==============================
  // ADD PROFILE
  // ==============================
  const addProfile = () => {
    if (!title) return;

    const newProfile: JobProfile = {
      id: Date.now().toString(),
      title,
      experience,
      skills,
      additional,
    };

    setProfiles([...profiles, newProfile]);
    setSelectedProfile(newProfile.id);

    setTitle("");
    setExperience("");
    setSkills("");
    setAdditional("");
  };

  // ==============================
  // DELETE PROFILE
  // ==============================
  const deleteProfile = (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    setProfiles(updated);

    if (updated.length > 0) {
      setSelectedProfile(updated[0].id);
    } else {
      setSelectedProfile("");
    }
  };

  // ==============================
  // HANDLE FILES
  // ==============================
  const handleFiles = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!selectedProfile) return;

    const files = e.target.files;
    if (!files) return;

    setLoading(true);
    const profile = profiles.find((p) => p.id === selectedProfile);

    // Process all files in parallel
    await Promise.all(
      Array.from(files).map(async (file) => {
        try {
          const filePart = await fileToGenerativePart(file);
          const prompt = `You are an expert HR Technical Recruiter. Evaluate this CV against the following job profile:
- Job Title: ${profile?.title}
- Required Experience: ${profile?.experience}
- Core Skills: ${profile?.skills}
- Additional Criteria: ${profile?.additional}

Provide a comprehensive, objective evaluation in exact JSON format. Include all required properties. Make sure the score indicates match quality (0-100).`;

          const response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: { parts: [filePart, { text: prompt }] },
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "Candidate name" },
                  score: { type: Type.NUMBER, description: "Suitability score out of 100" },
                  summary: { type: Type.STRING, description: "Concise summary of their fit" },
                  strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of top strengths" },
                  weaknesses: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of critical gaps or weaknesses" },
                  experience: { type: Type.STRING, description: "Short summary of years of experience" },
                  skills: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of top skills extracted" },
                  matchedKeywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Keywords from profile found in CV" },
                  missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Keywords from profile not found in CV" }
                },
                required: ["name", "score", "summary", "strengths", "weaknesses", "experience", "skills", "matchedKeywords", "missingKeywords"]
              }
            }
          });

          if (response.text) {
            const parsed = JSON.parse(response.text.trim());
            
            // Atomically update state to prevent race conditions during Promise.all
            setResults((prev) => {
              const currentList = prev[selectedProfile] || [];
              return {
                ...prev,
                [selectedProfile]: [
                  ...currentList,
                  {
                    id: crypto.randomUUID(),
                    ...parsed,
                  },
                ],
              };
            });
          }
        } catch (error) {
          console.error("Error processing file:", file.name, error);
        }
      })
    );

    setLoading(false);
    e.target.value = ""; // Reset the input field
  };

  // ==============================
  // FILTERED RESULTS
  // ==============================
  const filteredResults = useMemo(() => {
    const all = results[selectedProfile] || [];

    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) &&
        c.score >= filterScore
    );
  }, [results, selectedProfile, search, filterScore]);

  // ==============================
  // EXPORT CSV
  // ==============================
  const exportCSV = () => {
    const rows = filteredResults.map((c) => ({
      Name: c.name,
      Score: c.score,
      Experience: c.experience,
      Skills: c.skills.join(", "),
    }));

    const csv =
      "Name,Score,Experience,Skills\n" +
      rows
        .map(
          (r) =>
            `${r.Name},${r.Score},"${r.Experience}","${r.Skills}"`
        )
        .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "screenhr-results.csv";
    link.click();
  };

  return (
    <div
      className={`min-h-screen transition-all duration-300 ${
        dark
          ? "bg-[#0f172a] text-white"
          : "bg-gray-100 text-black"
      }`}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Briefcase className="w-7 h-7 text-blue-500" />
          <h1 className="text-2xl font-bold">
            ScreenHR Ultimate
          </h1>
        </div>

        <button
          onClick={() => setDark(!dark)}
          className={`p-2 rounded-xl ${dark ? "bg-slate-700" : "bg-white shadow text-gray-500 hover:text-gray-900"}`}
        >
          {dark ? <Sun /> : <Moon />}
        </button>
      </div>

      {/* MAIN */}
      <div className="p-6 max-w-7xl mx-auto">

        {/* CREATE PROFILE */}
        <div
          className={`rounded-3xl p-6 md:p-8 mb-8 ${
            dark ? "bg-slate-800" : "bg-white"
          } shadow-xl`}
        >
          <h2 className="text-xl font-bold mb-6">
            Create Job Profile
          </h2>

          <div className="grid md:grid-cols-2 gap-5">
            <input
              placeholder="Job Title (e.g. Senior Frontend Engineer)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`p-4 rounded-xl outline-none transition-colors border ${dark ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" : "bg-gray-50 border-gray-200 text-black focus:border-blue-500 focus:bg-white"}`}
            />

            <input
              placeholder="Required Experience (e.g. 5+ Years)"
              value={experience}
              onChange={(e) =>
                setExperience(e.target.value)
              }
              className={`p-4 rounded-xl outline-none transition-colors border ${dark ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" : "bg-gray-50 border-gray-200 text-black focus:border-blue-500 focus:bg-white"}`}
            />

            <input
              placeholder="Required Skills (e.g. React, Node.js, TypeScript)"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              className={`p-4 rounded-xl outline-none transition-colors border ${dark ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" : "bg-gray-50 border-gray-200 text-black focus:border-blue-500 focus:bg-white"}`}
            />

            <input
              placeholder="Additional Criteria (e.g. Next.js experience is a plus)"
              value={additional}
              onChange={(e) =>
                setAdditional(e.target.value)
              }
              className={`p-4 rounded-xl outline-none transition-colors border ${dark ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" : "bg-gray-50 border-gray-200 text-black focus:border-blue-500 focus:bg-white"}`}
            />
          </div>

          <button
            onClick={addProfile}
            disabled={!title}
            className="mt-6 px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            Save Profile
          </button>
        </div>

        {/* PROFILE TABS */}
        <div className="flex gap-3 overflow-auto mb-6 pb-2 scrollbar-none">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className={`px-5 py-3 rounded-2xl cursor-pointer flex items-center gap-3 transition-colors shrink-0 font-medium ${
                selectedProfile === profile.id
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                  : dark
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  : "bg-white text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-50"
              }`}
              onClick={() =>
                setSelectedProfile(profile.id)
              }
            >
              <span>{profile.title}</span>

              <button
                className={`p-1 rounded-md transition-colors ${selectedProfile === profile.id ? 'hover:bg-blue-500/50' : dark ? 'hover:bg-slate-600' : 'hover:bg-red-50 hover:text-red-500'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteProfile(profile.id);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {profiles.length === 0 && (
             <div className={`px-5 py-3 rounded-2xl border-2 border-dashed ${dark ? "border-slate-700 text-slate-500" : "border-gray-300 text-gray-500"} text-sm font-medium`}>
                Create a profile to unlock scanning
             </div>
          )}
        </div>

        {/* SEARCH + FILTER */}
        {selectedProfile && (
          <>
            <div className="flex flex-wrap gap-4 mb-6">
              <div className={`flex items-center gap-2 flex-1 min-w-[200px] px-4 py-3 rounded-xl border ${dark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-gray-200 text-black shadow-sm"}`}>
                <Search size={18} className="text-gray-400" />
                <input
                  placeholder="Search candidate..."
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  className="outline-none w-full bg-transparent"
                />
              </div>

              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${dark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-gray-200 text-black shadow-sm"}`}>
                <Filter size={18} className="text-gray-400" />
                <input
                  type="number"
                  placeholder="Min Score"
                  value={filterScore || ""}
                  onChange={(e) =>
                    setFilterScore(Number(e.target.value))
                  }
                  className="outline-none w-24 bg-transparent"
                />
              </div>

              <button
                onClick={exportCSV}
                disabled={filteredResults.length === 0}
                className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Download size={18} />
                Export CSV
              </button>
            </div>

            {/* UPLOAD */}
            <label
              className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all ${
                dark
                  ? "border-slate-600 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-500"
                  : "border-gray-300 bg-white hover:bg-blue-50/50 hover:border-blue-400"
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-4">
                <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>

              <p className="text-xl font-bold">
                Drop multiple CVs here
              </p>

              <p className={`mt-2 font-medium ${dark ? "text-slate-400" : "text-gray-500"}`}>
                PDF or TXT formats supported
              </p>

              <input
                type="file"
                multiple
                hidden
                accept=".pdf,.txt"
                onChange={handleFiles}
              />
            </label>

            {/* LOADING */}
            {loading && (
              <div className="mt-8 flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center">
                   <Loader2 className="animate-spin w-8 h-8" />
                </div>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  AI is analyzing and matching CVs...
                </p>
              </div>
            )}

            {/* RESULTS */}
            <div className="grid lg:grid-cols-2 gap-6 mt-8">
              {filteredResults.map((candidate) => (
                <div
                  key={candidate.id}
                  className={`rounded-3xl p-6 md:p-8 flex flex-col transition-all border ${
                    dark ? "bg-slate-800 border-slate-700 shadow-xl" : "bg-white border-gray-200 shadow-xl shadow-gray-200/40 hover:shadow-gray-300/60"
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="pr-4">
                      <h2 className="text-2xl font-bold tracking-tight mb-1">
                        {candidate.name}
                      </h2>
                      <p className={`font-medium ${dark ? "text-slate-400" : "text-gray-500"}`}>
                        {candidate.experience}
                      </p>
                    </div>

                    <div className={`shrink-0 w-[4.5rem] h-[4.5rem] rounded-2xl flex flex-col items-center justify-center shadow-inner
                        ${candidate.score >= 80 ? 'bg-emerald-500 text-white' : candidate.score >= 60 ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'}`}
                    >
                      <span className="text-2xl font-bold">{candidate.score}</span>
                      <span className="text-[10px] uppercase font-bold tracking-widest opacity-80">Match</span>
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl mb-6 text-sm leading-relaxed ${dark ? "bg-slate-900/50" : "bg-gray-50 border border-gray-100"}`}>
                    {candidate.summary}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 flex-1">
                    {/* STRENGTHS */}
                    <div>
                      <h3 className={`font-bold flex items-center gap-2 mb-3 tracking-wide text-xs uppercase ${dark ? "text-emerald-400" : "text-emerald-600"}`}>
                        <Star size={16} />
                        Strengths
                      </h3>

                      <div className="flex flex-col gap-2">
                        {candidate.strengths.slice(0,3).map((s, i) => (
                          <div
                            key={i}
                            className={`px-3 py-2 rounded-xl text-sm font-medium border ${
                              dark ? "bg-emerald-900/20 border-emerald-800/50 text-emerald-300" : "bg-emerald-50 border-emerald-100 text-emerald-700"
                            }`}
                          >
                            {s}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* WEAKNESSES */}
                    <div>
                      <h3 className={`font-bold flex items-center gap-2 mb-3 tracking-wide text-xs uppercase ${dark ? "text-rose-400" : "text-rose-600"}`}>
                        <BarChart3 size={16} />
                        Weaknesses
                      </h3>

                      <div className="flex flex-col gap-2">
                        {candidate.weaknesses.slice(0,3).map((w, i) => (
                          <div
                            key={i}
                            className={`px-3 py-2 rounded-xl text-sm font-medium border ${
                              dark ? "bg-rose-900/20 border-rose-800/50 text-rose-300" : "bg-rose-50 border-rose-100 text-rose-700"
                            }`}
                          >
                            {w}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* MATCHED KEYWORDS */}
                    <div className="md:col-span-2">
                      <h3 className={`font-bold flex items-center gap-2 mb-2 tracking-wide text-xs uppercase ${dark ? "text-blue-400" : "text-blue-600"}`}>
                        <CheckCircle size={16} />
                        Matched Keywords
                      </h3>

                      <div className="flex flex-wrap gap-2">
                        {candidate.matchedKeywords.map(
                          (s, i) => (
                            <span
                              key={i}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide border ${
                                dark ? "bg-blue-900/30 border-blue-800/50 text-blue-300" : "bg-blue-50 border-blue-100 text-blue-700"
                              }`}
                            >
                              {s}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* REPORT */}
                  <button className={`mt-auto w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors ${
                      dark ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-gray-100 border border-gray-200 hover:bg-gray-200 text-gray-700"
                    }`}>
                    <FileText size={18} />
                    View Full Report
                  </button>
                </div>
              ))}
            </div>

            {/* ANALYTICS */}
            {filteredResults.length > 0 && (
              <div
                className={`mt-10 rounded-3xl p-6 md:p-8 shadow-xl ${
                  dark ? "bg-slate-800 border border-slate-700" : "bg-white border border-gray-100"
                }`}
              >
                <div className="flex items-center gap-3 mb-6">
                  <BarChart3 className="w-8 h-8 text-blue-500" />
                  <h2 className="text-2xl font-bold">
                    Hiring Analytics
                  </h2>
                </div>

                <div className="grid sm:grid-cols-3 gap-5">
                  <div className="p-6 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                    <p className="font-semibold opacity-90">Total Candidates</p>
                    <h1 className="text-4xl font-bold mt-2">
                      {filteredResults.length}
                    </h1>
                  </div>

                  <div className="p-6 rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                    <p className="font-semibold opacity-90">Average Score</p>
                    <h1 className="text-4xl font-bold mt-2">
                      {filteredResults.length > 0
                        ? Math.round(
                            filteredResults.reduce(
                              (a, b) => a + b.score,
                              0
                            ) / filteredResults.length
                          )
                        : 0}
                    </h1>
                  </div>

                  <div className="p-6 rounded-2xl bg-purple-600 text-white shadow-lg shadow-purple-600/20">
                    <p className="font-semibold opacity-90">Top Candidate</p>
                    <h1 className="text-2xl font-bold mt-2 truncate">
                      {filteredResults.sort(
                        (a, b) => b.score - a.score
                      )[0]?.name || "N/A"}
                    </h1>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
