import React, { useState, useEffect } from 'react';
import { Settings, Shield, User, Users, Lock, LogIn, ChevronLeft, Save } from 'lucide-react';
import OrganizerLink from './OrganizerLink.jsx';
import AccountChip from './AccountChip.jsx';
import { ADMIN_HASH, organizerUrl, signInAdmin } from './auth.js';
import DiscordPanel from './DiscordPanel.jsx';
import { defaultDiscord, sendDiscord } from './discord.js';

const initialConfig = {
  boy: {
    question: "Yo {name}, you coming to college today?",
    yesText: "Yeah bro",
    noText: "Nah",
    successMessage: "Aight, see you at Graphic Era, {name}. Don't be late.",
    mainImage: "https://media.tenor.com/HIfEevXJ_5MAAAAC/cat-staring.gif",
    successImage: "https://media.tenor.com/y1y11UrdT4sAAAAC/epic-handshake.gif",
    themeColor: "#1e40af",
    backgroundColor: "#f3f4f6",
    noMessages: ["Nah", "Stop being lazy", "Get up bro", "Attendance is short", "Bro just come", "I'm telling the HOD"],
  },
  girl: {
    question: "Hey {name}, are you coming to college today? ✨",
    yesText: "Yes!",
    noText: "No",
    successMessage: "Yay! See you at Graphic Era, {name}! 🎓",
    mainImage: "https://media.tenor.com/mRzR2N8ZfHAAAAAC/peach-goma.gif",
    successImage: "https://media.tenor.com/N710GgQZ85AAAAAC/tkthao219-bubududu.gif",
    themeColor: "#db2777",
    backgroundColor: "#fce7f3",
    noMessages: ["No", "Are you sure?", "But attendance! 🥺", "Don't bunk!", "Come onnn", "See you there anyway!"],
  }
};

export default function App() {
  const [appState, setAppState] = useState('welcome'); // welcome, gender, quiz, success, adminAuth, admin
  const [visitorName, setVisitorName] = useState('');
  const [gender, setGender] = useState(null); // 'boy' or 'girl'
  
  const [noCount, setNoCount] = useState(0);
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('collegeQuizConfig');
    return saved ? JSON.parse(saved) : initialConfig;
  });

  const [adminUsernameInput, setAdminUsernameInput] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [editConfig, setEditConfig] = useState(config);
  const [activeAdminTab, setActiveAdminTab] = useState('boy');
  const [toast, setToast] = useState('');

  useEffect(() => {
    localStorage.setItem('collegeQuizConfig', JSON.stringify(config));
  }, [config]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleStart = (e) => {
    e.preventDefault();
    if (visitorName.trim()) {
      setAppState('gender');
    }
  };

  const handleGenderSelect = (selectedGender) => {
    setGender(selectedGender);
    setAppState('quiz');
  };

  const handleNoClick = () => {
    setNoCount((prev) => prev + 1);
  };

  const handleYesClick = () => {
    setAppState('success');
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminError('');
    const result = await signInAdmin(adminUsernameInput, adminPasswordInput);
    if (result.ok) {
      setAppState('admin');
      setAdminUsernameInput('');
      setAdminPasswordInput('');
    } else {
      setAdminError(result.reason);
    }
  };

  const saveAdminSettings = () => {
    setConfig(editConfig);
    showToast('Settings saved successfully!');
  };

  const resetToDefault = () => {
    setEditConfig(initialConfig);
    setConfig(initialConfig);
    showToast('Reset to default configurations!');
  };

  const replacePlaceholders = (text) => {
    return text.replace(/{name}/g, visitorName || 'Friend');
  };

  const currentConfig = gender ? config[gender] : config.boy;
  const noMessages = currentConfig.noMessages;
  const yesButtonSize = noCount * 20 + 16;
  
  // Dynamic styles based on gender theme
  const themeStyle = gender ? {
    backgroundColor: currentConfig.backgroundColor,
    color: '#1f2937',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  } : {};

  // Render Welcome Screen
  if (appState === 'welcome') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <button 
          onClick={() => setAppState('adminAuth')}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Settings size={24} />
        </button>

        <OrganizerLink />
        <AccountChip />

        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Hey there! 👋</h1>
          <p className="text-gray-600 mb-6">Before we begin, what's your name?</p>
          
          <form onSubmit={handleStart} className="space-y-4">
            <input
              type="text"
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              placeholder="Enter your name..."
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-500 focus:outline-none transition-colors"
              required
            />
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-md"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Gender Selection
  if (appState === 'gender') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <OrganizerLink />
        <AccountChip />
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Welcome, {visitorName}!</h2>
          <p className="text-gray-600 mb-8">Choose your vibe:</p>
          
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleGenderSelect('boy')}
              className="flex flex-col items-center p-6 border-2 border-blue-200 rounded-xl hover:bg-blue-50 hover:border-blue-500 transition-all"
            >
              <User size={48} className="text-blue-600 mb-2" />
              <span className="font-semibold text-blue-900">Bro Mode</span>
            </button>
            
            <button
              onClick={() => handleGenderSelect('girl')}
              className="flex flex-col items-center p-6 border-2 border-pink-200 rounded-xl hover:bg-pink-50 hover:border-pink-500 transition-all"
            >
              <Users size={48} className="text-pink-600 mb-2" />
              <span className="font-semibold text-pink-900">Girl Mode</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Admin Auth
  if (appState === 'adminAuth') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 p-4">
        <button 
          onClick={() => setAppState('welcome')}
          className="absolute top-4 left-4 p-2 text-gray-400 hover:text-white flex items-center gap-2"
        >
          <ChevronLeft size={20} /> Back
        </button>

        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex justify-center mb-6">
            <Shield size={48} className="text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold text-white text-center mb-6">Admin Access</h2>
          
          <p className="mb-6 text-center text-sm text-gray-400">
            Same admin login as the assignment organizer.
          </p>
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div className="relative">
              <User className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                value={adminUsernameInput}
                onChange={(e) => setAdminUsernameInput(e.target.value)}
                placeholder="Admin username"
                autoComplete="username"
                className="w-full pl-10 pr-4 py-3 bg-gray-700 text-white rounded-xl border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="password"
                value={adminPasswordInput}
                onChange={(e) => setAdminPasswordInput(e.target.value)}
                placeholder="Admin password"
                autoComplete="current-password"
                className="w-full pl-10 pr-4 py-3 bg-gray-700 text-white rounded-xl border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 flex justify-center items-center gap-2"
            >
              <LogIn size={20} /> Login
            </button>
          </form>
          {adminError && <p className="mt-4 text-center text-red-400">{adminError}</p>}
          <a
            href={organizerUrl(ADMIN_HASH)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-500 transition-colors hover:text-gray-300"
          >
            <Shield size={12} /> Organizer admin gate
          </a>
        </div>
      </div>
    );
  }

  // Render Admin Settings
  if (appState === 'admin') {
    return (
      <div className="min-h-screen bg-gray-100 p-4 md:p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gray-900 px-6 py-4 flex justify-between items-center text-white">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Settings size={24} /> Configuration Panel
            </h2>
            <button 
              onClick={() => setAppState('welcome')}
              className="text-gray-300 hover:text-white"
            >
              Exit Admin
            </button>
          </div>

          <div className="flex border-b">
            <button
              className={`flex-1 py-4 font-semibold ${activeAdminTab === 'boy' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
              onClick={() => setActiveAdminTab('boy')}
            >
              Bro Mode Settings
            </button>
            <button
              className={`flex-1 py-4 font-semibold ${activeAdminTab === 'girl' ? 'bg-pink-50 text-pink-700 border-b-2 border-pink-600' : 'text-gray-500 hover:bg-gray-50'}`}
              onClick={() => setActiveAdminTab('girl')}
            >
              Girl Mode Settings
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm mb-6">
              <strong>Tip:</strong> Use <code>{'{name}'}</code> in your questions or success messages to automatically insert the visitor's name!
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Main Question</label>
                  <input
                    type="text"
                    value={editConfig[activeAdminTab].question}
                    onChange={(e) => setEditConfig({...editConfig, [activeAdminTab]: {...editConfig[activeAdminTab], question: e.target.value}})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Success Message</label>
                  <input
                    type="text"
                    value={editConfig[activeAdminTab].successMessage}
                    onChange={(e) => setEditConfig({...editConfig, [activeAdminTab]: {...editConfig[activeAdminTab], successMessage: e.target.value}})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Yes Button Text</label>
                    <input
                      type="text"
                      value={editConfig[activeAdminTab].yesText}
                      onChange={(e) => setEditConfig({...editConfig, [activeAdminTab]: {...editConfig[activeAdminTab], yesText: e.target.value}})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Base No Text</label>
                    <input
                      type="text"
                      value={editConfig[activeAdminTab].noText}
                      onChange={(e) => setEditConfig({...editConfig, [activeAdminTab]: {...editConfig[activeAdminTab], noText: e.target.value}})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Main Image URL (GIF/PNG)</label>
                  <input
                    type="text"
                    value={editConfig[activeAdminTab].mainImage}
                    onChange={(e) => setEditConfig({...editConfig, [activeAdminTab]: {...editConfig[activeAdminTab], mainImage: e.target.value}})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Success Image URL (GIF/PNG)</label>
                  <input
                    type="text"
                    value={editConfig[activeAdminTab].successImage}
                    onChange={(e) => setEditConfig({...editConfig, [activeAdminTab]: {...editConfig[activeAdminTab], successImage: e.target.value}})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">"No" Button Excuses (Comma separated)</label>
                  <textarea
                    rows="3"
                    value={editConfig[activeAdminTab].noMessages.join(', ')}
                    onChange={(e) => setEditConfig({...editConfig, [activeAdminTab]: {...editConfig[activeAdminTab], noMessages: e.target.value.split(',').map(s => s.trim())}})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 mt-6 border-t flex justify-between items-center">
              <button
                onClick={resetToDefault}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
              >
                Reset to Defaults
              </button>
              
              <div className="flex items-center gap-4">
                {toast && <span className="text-green-600 font-medium">{toast}</span>}
                <button
                  onClick={saveAdminSettings}
                  className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <Save size={20} /> Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Quiz & Success states
  return (
    <div style={themeStyle}>
      <OrganizerLink />
      <AccountChip />
      <div className="max-w-xl w-full mx-auto text-center">
        {appState === 'success' ? (
          <div className="animate-in zoom-in duration-500">
            <img 
              src={currentConfig.successImage} 
              alt="Success" 
              className="w-64 h-64 object-cover rounded-2xl mx-auto shadow-2xl mb-8"
            />
            <h1 
              className="text-3xl md:text-5xl font-bold mb-8 px-4"
              style={{ color: currentConfig.themeColor }}
            >
              {replacePlaceholders(currentConfig.successMessage)}
            </h1>
          </div>
        ) : (
          <div>
            <img 
              src={currentConfig.mainImage} 
              alt="Question" 
              className="w-64 h-64 object-cover rounded-2xl mx-auto shadow-xl mb-8"
            />
            <h1 
              className="text-3xl md:text-4xl font-bold mb-12 px-4"
              style={{ color: currentConfig.themeColor }}
            >
              {replacePlaceholders(currentConfig.question)}
            </h1>
            
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 min-h-[100px]">
              <button
                onClick={handleYesClick}
                className="text-white font-bold rounded-xl shadow-lg transition-all hover:opacity-90"
                style={{ 
                  backgroundColor: currentConfig.themeColor,
                  fontSize: `${yesButtonSize}px`,
                  padding: `${yesButtonSize/2}px ${yesButtonSize}px`
                }}
              >
                {currentConfig.yesText}
              </button>
              
              <button
                onClick={handleNoClick}
                className="bg-gray-400 text-white font-bold rounded-xl shadow-md transition-all hover:bg-gray-500"
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  transform: `scale(${Math.max(0, 1 - (noCount * 0.15))})`,
                  opacity: Math.max(0, 1 - (noCount * 0.15)),
                  display: noCount >= 6 ? 'none' : 'block'
                }}
              >
                {noCount === 0 ? currentConfig.noText : noMessages[Math.min(noCount, noMessages.length - 1)]}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
