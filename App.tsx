
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GameState, CarData, SurrealTheme, TelemetryData } from './types';
import { INITIAL_CARS } from './constants';
import GameScene, { SegmentData, getRandomThemeColors } from './components/GameScene';
import AudioEngine, { AudioEngineHandle } from './components/AudioEngine';
import Garage from './components/Garage';
import { Play, Trophy, ChevronLeft, ChevronRight, Zap, Octagon, Settings, X, Volume2, VolumeX, Sparkles, Music, Speaker, Bug } from 'lucide-react';
import { Language, RESOURCES } from './locales';
import * as THREE from 'three';

// --- Local Theme Generation ---
const generateSurrealAtmosphere = async (): Promise<SurrealTheme> => {
  // Use the random color generator directly for initial state
  const colors = getRandomThemeColors();
  
  const fx = { distort: 0.1, speed: 1.0, aberration: 0.01, bloom: 1.0 };
  const sun: SurrealTheme['sun'] = { position: [100, 50, 50], color: '#fff', intensity: 2 };
  return Promise.resolve({ audioMood: 'tense', fx, colors, sun });
};

// --- MiniMap Component (Radar) ---
const MiniMap = ({ 
  fullTrackData, 
  telemetry,
  isFullSize = false,
  playerColor = 'cyan'
}: { 
  fullTrackData: SegmentData[], 
  telemetry?: TelemetryData,
  isFullSize?: boolean,
  playerColor?: string
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || fullTrackData.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    // Auto-fit track to canvas
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    fullTrackData.forEach(s => {
        if(s.position.x < minX) minX = s.position.x;
        if(s.position.x > maxX) maxX = s.position.x;
        if(s.position.z < minZ) minZ = s.position.z;
        if(s.position.z > maxZ) maxZ = s.position.z;
    });
    
    const trackW = maxX - minX;
    const trackH = maxZ - minZ;
    const scale = Math.min(width / trackW, height / trackH) * 0.8;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    ctx.save();
    ctx.translate(width / 2, height / 2);
    
    if (!isFullSize && telemetry) {
         // Rotate map around player in HUD mode
         ctx.rotate(telemetry.player.rot);
         ctx.scale(0.3, 0.3); // Zoom in for HUD
         ctx.translate(-telemetry.player.x, -telemetry.player.z);
    } else {
         // Static full view for Loading
         ctx.scale(scale, scale);
         ctx.translate(-cx, -cz);
    }

    ctx.lineWidth = isFullSize ? 8 : 25;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    fullTrackData.forEach((seg, i) => {
        if(i===0) ctx.moveTo(seg.position.x, seg.position.z);
        else ctx.lineTo(seg.position.x, seg.position.z);
    });
    ctx.closePath();
    ctx.stroke();

    // Draw Player if available
    if (telemetry && !isFullSize) {
        // Opponents
        telemetry.opponents.forEach(op => {
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(op.x, op.z, 20, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    
    ctx.restore();
    
    // HUD Player Indicator
    if (!isFullSize && telemetry) {
        ctx.save();
        ctx.translate(width / 2, height / 2);
        
        // Resolve neon color
        let indicatorColor = '#ffffff';
        switch (playerColor) {
            case 'cyan': indicatorColor = '#00ffff'; break;
            case 'blue': indicatorColor = '#0000ff'; break;
            case 'red': indicatorColor = '#ff0000'; break;
            case 'green': indicatorColor = '#00ff00'; break;
            case 'purple': indicatorColor = '#aa00ff'; break;
            default: indicatorColor = '#ffffff';
        }

        ctx.fillStyle = indicatorColor;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(10, 15);
        ctx.lineTo(0, 10);
        ctx.lineTo(-10, 15);
        ctx.fill();
        ctx.restore();
    }

  }, [fullTrackData, telemetry, isFullSize, playerColor]);

  return (
    <div className={`w-full h-full relative ${isFullSize ? '' : 'rounded-full bg-black/50'} overflow-hidden`}>
        <canvas ref={canvasRef} width={isFullSize ? 600 : 200} height={isFullSize ? 400 : 200} className="w-full h-full" />
    </div>
  );
};

// --- Loading Screen ---
const LoadingScreen = ({ text, fullTrackData }: { text: string, fullTrackData: SegmentData[] }) => {
    return (
        <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center text-white overflow-hidden">
             <div className="text-center w-full max-w-4xl px-8 flex flex-col items-center">
                 <h2 className="text-2xl md:text-4xl font-black mb-8 tracking-widest animate-pulse font-serif">
                     {text}
                 </h2>
                 {fullTrackData.length > 0 && (
                     <div className="w-full max-w-md aspect-video bg-white/5 mb-8 p-4">
                         <MiniMap fullTrackData={fullTrackData} isFullSize={true} />
                     </div>
                 )}
                 <div className="w-64 h-1 bg-white/10 overflow-hidden">
                     <div className="h-full bg-cyan-400 w-1/3 animate-[shimmer_1s_infinite_linear]" style={{
                         backgroundImage: 'linear-gradient(90deg, transparent, white, transparent)'
                     }}></div>
                 </div>
             </div>
        </div>
    )
}

const SettingsModal = ({ isOpen, onClose, isMusicMuted, toggleMusic, isSfxMuted, toggleSfx, particlesEnabled, toggleParticles, language, setLanguage }: any) => {
    if (!isOpen) return null;
    const t = RESOURCES[language];

    return (
        <div className="absolute inset-0 z-[60] bg-black/90 backdrop-blur-md flex items-center justify-center">
            <div className="w-full max-w-2xl bg-black p-12 relative border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.1)]">
                <button onClick={onClose} className="absolute top-6 right-6 text-white hover:text-cyan-400 btn-glow"><X className="w-8 h-8" /></button>
                <h2 className="text-3xl font-bold uppercase mb-8 border-b border-white/10 pb-4 font-serif">{t.settings}</h2>
                <div className="space-y-8 text-lg">
                    <div className="flex flex-col gap-4">
                        <span className="text-sm uppercase opacity-70 tracking-widest">{t.language}</span>
                        <div className="grid grid-cols-5 gap-4">
                             {(['ja', 'zh_CN', 'zh_TW', 'en', 'ko'] as Language[]).map(lang => (
                                 <button key={lang} onClick={() => setLanguage(lang)}
                                    className={`py-3 px-2 text-sm font-bold transition-colors btn-glow ${language === lang ? 'text-cyan-400' : 'text-white/30 hover:text-white'}`}>
                                     {lang === 'zh_CN' ? '简中' : lang === 'zh_TW' ? '繁中' : lang === 'ja' ? '日本語' : lang === 'en' ? 'ENG' : '한국어'}
                                 </button>
                             ))}
                        </div>
                    </div>
                    <hr className="border-white/5" />
                    <div className="flex items-center justify-between">
                        <span className="uppercase tracking-widest">{t.music}</span>
                        <button onClick={toggleMusic} className={`text-sm font-bold transition-colors btn-glow px-4 py-2 ${!isMusicMuted ? 'text-cyan-400' : 'text-white/30 hover:text-white'}`}>
                            {isMusicMuted ? t.off : t.on}
                        </button>
                    </div>
                     <div className="flex items-center justify-between">
                        <span className="uppercase tracking-widest">{t.sfx}</span>
                        <button onClick={toggleSfx} className={`text-sm font-bold transition-colors btn-glow px-4 py-2 ${!isSfxMuted ? 'text-cyan-400' : 'text-white/30 hover:text-white'}`}>
                            {isSfxMuted ? t.off : t.on}
                        </button>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="uppercase tracking-widest">{t.particles}</span>
                        <button onClick={toggleParticles} className={`text-sm font-bold transition-colors btn-glow px-4 py-2 ${particlesEnabled ? 'text-cyan-400' : 'text-white/30 hover:text-white'}`}>
                            {particlesEnabled ? t.on : t.off}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [raceCar, setRaceCar] = useState<CarData>(INITIAL_CARS[0]);
  const [fullTrackData, setFullTrackData] = useState<SegmentData[]>([]);
  const [trackSeed, setTrackSeed] = useState<number>(1);
  const [isRaceReady, setIsRaceReady] = useState(false);
  const [hasRaceStarted, setHasRaceStarted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [isSfxMuted, setIsSfxMuted] = useState(false);
  const [particlesEnabled, setParticlesEnabled] = useState(true);
  const [language, setLanguage] = useState<Language>('ja'); 
  const [countdown, setCountdown] = useState(3); // 3 second countdown

  const audioEngineRef = useRef<AudioEngineHandle>(null);
  const virtualKeys = useRef({ w: false, a: false, s: false, d: false, space: false, shift: false });
  const [telemetry, setTelemetry] = useState<TelemetryData>({
      speed: 0, nitro: 150, progress: 0, rank: 1, lap: 1, totalLaps: 3, player: { x: 0, z: 0, rot: 0 }, opponents: [],
      currentTheme: 'mist', isGlitching: false, isDrifting: false, isPerfectNitro: false, damage: 0,
      stats: { maxSpeed: 0, maxDriftTime: 0, collisions: 0 }
  });
  
  // Use initialized theme with random colors immediately
  const [currentTheme, setCurrentTheme] = useState<SurrealTheme>(() => {
      const colors = getRandomThemeColors();
      const fx = { distort: 0.1, speed: 1.0, aberration: 0.01, bloom: 1.0 };
      const sun: SurrealTheme['sun'] = { position: [100, 50, 50], color: '#fff', intensity: 2 };
      return { audioMood: 'tense', fx, colors, sun };
  });
  
  const t = RESOURCES[language];

  // Resume Audio Context on any user interaction at the top level
  useEffect(() => {
      const resumeAudio = () => {
          if (audioEngineRef.current) {
              audioEngineRef.current.resume();
          }
      };
      window.addEventListener('click', resumeAudio, true);
      window.addEventListener('touchstart', resumeAudio, true);
      window.addEventListener('keydown', resumeAudio, true);
      return () => {
          window.removeEventListener('click', resumeAudio, true);
          window.removeEventListener('touchstart', resumeAudio, true);
          window.removeEventListener('keydown', resumeAudio, true);
      }
  }, []);

  useEffect(() => {
      let interval: number;
      if (hasRaceStarted && countdown > 0) {
          interval = window.setInterval(() => {
              setCountdown(prev => {
                  if (prev <= 1) {
                      clearInterval(interval);
                      return 0;
                  }
                  return prev - 1;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [hasRaceStarted, countdown]);

  // Audio Bar Callback to sync Theme
  const handleBarChange = useCallback((bar: number) => {
      // Change theme every 16 bars
      if (bar > 0 && bar % 16 === 0) {
           setCurrentTheme(prev => ({
               ...prev,
               colors: getRandomThemeColors()
           }));
      }
  }, []);

  const startRace = async (car: CarData) => {
    audioEngineRef.current?.resume();
    audioEngineRef.current?.playSfx('click');
    setIsRaceReady(false);
    setHasRaceStarted(false);
    setCountdown(3); // Reset Countdown
    
    // Randomize theme again for the race
    const initialTheme = await generateSurrealAtmosphere();
    setCurrentTheme(initialTheme);
    setRaceCar(car);
    setTrackSeed(Math.random());
    setGameState(GameState.RACE);
    
    setTimeout(() => {
        setIsRaceReady(true);
        setTimeout(() => setHasRaceStarted(true), 500);
    }, 2500);
  };

  const handleTrackInit = useCallback((path: SegmentData[]) => {
      setFullTrackData(path);
  }, []);

  return (
    <div className="w-full h-screen bg-black text-white overflow-hidden select-none font-serif font-light">
      <AudioEngine 
        ref={audioEngineRef} 
        isPlaying={true} 
        mode={gameState === GameState.RACE ? 'race' : 'menu'} 
        musicMuted={isMusicMuted} 
        sfxMuted={isSfxMuted} 
        paused={showSettings} 
        onBarChange={handleBarChange}
      />
      
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} isMusicMuted={isMusicMuted} toggleMusic={() => setIsMusicMuted(!isMusicMuted)} isSfxMuted={isSfxMuted} toggleSfx={() => setIsSfxMuted(!isSfxMuted)} particlesEnabled={particlesEnabled} toggleParticles={() => setParticlesEnabled(!particlesEnabled)} language={language} setLanguage={setLanguage} />
      
      {!showSettings && gameState !== GameState.RACE && (
           <button onClick={() => setShowSettings(true)} className="absolute top-6 right-6 z-50 p-3 text-white/50 hover:text-white transition-colors btn-glow"><Settings className="w-8 h-8" /></button>
      )}

      {gameState === GameState.RACE && (
        <div className="absolute inset-0 z-0">
            <GameScene 
                playerCar={raceCar}
                onRaceEnd={() => setGameState(GameState.RESULTS)}
                onRaceUpdate={setTelemetry}
                onTrackInit={handleTrackInit}
                onReady={() => {}} 
                currentThemeColors={currentTheme.colors}
                fxParams={currentTheme.fx}
                virtualKeys={virtualKeys.current}
                trackSeed={trackSeed}
                audioMood={currentTheme.audioMood}
                sun={currentTheme.sun}
                particlesEnabled={particlesEnabled}
                isPaused={showSettings || !isRaceReady}
                language={language}
                countdown={countdown}
            />
        </div>
      )}
      
      {gameState === GameState.RACE && !hasRaceStarted && <LoadingScreen text={t.race.loading} fullTrackData={fullTrackData} />}
      
      {/* Countdown Overlay */}
      {gameState === GameState.RACE && hasRaceStarted && countdown > 0 && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="text-8xl md:text-[12rem] font-black italic text-cyan-400 animate-pulse tracking-tighter" style={{ textShadow: '0 0 50px cyan' }}>
                  {countdown}
              </div>
          </div>
      )}

      {gameState === GameState.MENU && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black">
            <div className="w-full px-8 py-12 flex flex-col gap-4 items-center text-center mt-16">
                <div>
                    <h1 className="font-bold tracking-widest uppercase leading-none italic mix-blend-difference whitespace-nowrap" style={{ fontSize: '6vw', textShadow: '0 0 30px rgba(255,255,255,0.2)' }}>
                        {t.title}
                    </h1>
                    {language !== 'en' && (
                        <div className="text-sm md:text-lg tracking-[0.8em] uppercase mt-4 opacity-80 text-center w-full flex justify-center">
                            {t.subtitle}
                        </div>
                    )}
                </div>
                <button onClick={() => { audioEngineRef.current?.resume(); audioEngineRef.current?.playSfx('click'); setGameState(GameState.GARAGE); }}
                    className="mt-8 px-16 py-6 text-2xl uppercase hover:text-cyan-400 text-white transition-all tracking-widest bg-transparent btn-glow">
                    {t.start}
                </button>
            </div>
        </div>
      )}

      {gameState === GameState.GARAGE && (
          <Garage cars={INITIAL_CARS} onSelect={startRace} onBack={() => setGameState(GameState.MENU)} language={language} />
      )}

      {gameState === GameState.RACE && hasRaceStarted && (
        <div className="absolute inset-0 z-20 pointer-events-none p-6 md:p-12 flex flex-col justify-between">
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                     <div className="text-4xl md:text-5xl font-bold italic">{telemetry.rank}</div>
                     <div className="flex flex-col"><span className="text-[10px] opacity-60 uppercase">{t.race.rank}</span><span className="text-sm">/ 8</span></div>
                </div>
                {/* Lap Counter Added Here */}
                <div className="flex items-center gap-4">
                    <div className="text-4xl md:text-5xl font-bold italic">LAP {telemetry.lap}/{telemetry.totalLaps}</div>
                </div>
                <div className="flex flex-col items-end">
                    <div className="text-4xl md:text-6xl font-bold italic">{Math.floor(telemetry.progress)}%</div>
                </div>
            </div>
            
            {/* HUD MiniMap Positioned to the Side (Top Right, slightly offset) */}
            <div className="absolute top-44 right-6 md:right-12 z-30 opacity-80 border border-white/20 rounded-lg overflow-hidden bg-black/50 backdrop-blur-md shadow-[0_0_15px_rgba(0,255,255,0.2)]" style={{ width: '150px', height: '150px' }}>
                <MiniMap fullTrackData={fullTrackData} telemetry={telemetry} playerColor={raceCar.visuals.neon} />
            </div>

            <div className="flex items-end justify-between w-full relative">
                <div className="flex flex-col gap-2 w-32 md:w-64">
                    <div className="flex justify-between text-[10px] uppercase"><span>{t.race.nitro}</span></div>
                    {/* Updated to use 150 as denominator */}
                    <div className="w-full h-1 bg-white/10"><div className={`h-full bg-white ${telemetry.isPerfectNitro ? 'animate-pulse bg-cyan-400' : ''}`} style={{ width: `${(telemetry.nitro / 150) * 100}%` }} /></div>
                </div>
                {/* Removed center-bottom minimap */}
                <div className="text-right">
                     <div className="text-5xl md:text-7xl font-bold italic">{telemetry.speed}</div>
                     <div className="text-xs tracking-widest border-t border-white/20 pt-1 mt-1 uppercase">{t.race.speedUnit}</div>
                </div>
            </div>
             {/* Mobile Controls */}
             <div className="absolute inset-0 pointer-events-auto md:hidden" style={{ touchAction: 'none' }}>
                 <div className="absolute bottom-4 left-4 flex gap-4">
                     <div onPointerDown={() => virtualKeys.current.a = true} onPointerUp={() => virtualKeys.current.a = false} className="w-20 h-20 border border-white/10 flex items-center justify-center bg-black/20"><ChevronLeft /></div>
                     <div onPointerDown={() => virtualKeys.current.d = true} onPointerUp={() => virtualKeys.current.d = false} className="w-20 h-20 border border-white/10 flex items-center justify-center bg-black/20"><ChevronRight /></div>
                 </div>
                 <div className="absolute bottom-4 right-4 flex gap-4">
                     <div onPointerDown={() => virtualKeys.current.s = true} onPointerUp={() => virtualKeys.current.s = false} className="w-16 h-16 border border-white/10 flex items-center justify-center bg-black/20 flex-col"><Octagon size={16}/><span className="text-[8px]">BRK</span></div>
                     <div onPointerDown={() => virtualKeys.current.shift = !virtualKeys.current.shift} className="w-24 h-24 border border-cyan-400/50 rounded-full flex items-center justify-center bg-cyan-900/20"><Zap /></div>
                 </div>
            </div>
        </div>
      )}

      {gameState === GameState.RESULTS && (
          <div className="absolute inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
              <div className="bg-white/5 p-16 md:p-24 text-center max-w-xl w-full border border-white/10 shadow-2xl">
                  <h2 className="text-3xl md:text-5xl font-bold uppercase mb-8 italic">{t.race.finished}</h2>
                  <div className="flex justify-center mb-8"><div className="bg-black/50 px-8 py-4 border border-white/20"><div className="text-xs uppercase opacity-60">{t.race.finalRank}</div><div className="text-4xl font-bold">{telemetry.rank} / 8</div></div></div>
                  <div className="flex gap-4 w-full">
                      <button onClick={() => setGameState(GameState.MENU)} className="flex-1 uppercase py-4 hover:text-white transition-all text-xs tracking-widest btn-glow" style={{ color: 'white' }}>{t.race.toGarage}</button>
                      <button onClick={() => startRace(raceCar)} className="flex-1 uppercase py-4 hover:text-cyan-400 transition-all text-xs tracking-widest btn-glow" style={{ color: 'cyan' }}>{t.race.retry}</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
export default App;
