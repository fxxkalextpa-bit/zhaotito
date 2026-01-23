
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Text, Float } from '@react-three/drei';
import { CarData, CarStats, VisualMods } from '../types';
import { INITIAL_CARS } from '../constants';
import { ChevronRight, ChevronLeft, ArrowLeft, Paintbrush, Wrench } from 'lucide-react';
import { CarModel } from './CarModels';
import * as THREE from 'three';
import { Language, RESOURCES } from '../locales';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [key: string]: any;
    }
  }
}

interface GarageProps {
  cars: CarData[];
  onSelect: (car: CarData) => void;
  onBack: () => void;
  language: Language;
}

type Tab = 'stats' | 'visuals' | 'paint';

// --- Loading Placeholder ---
const LoadingPlaceholder = ({ text }: { text: string }) => {
    return (
        <group>
            <Float speed={5} rotationIntensity={0.5} floatIntensity={0.5}>
                <Text
                    fontSize={0.5}
                    color="cyan"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.02}
                    outlineColor="black"
                >
                    {text}
                </Text>
            </Float>
            <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.5, 0]}>
                <ringGeometry args={[1, 1.2, 32]} />
                <meshBasicMaterial color="cyan" transparent opacity={0.3} side={THREE.DoubleSide} />
            </mesh>
        </group>
    )
}

// --- Wrapper for Garage Scene ---
const GarageSceneWrapper = ({ car, loadingText }: { car: CarData, loadingText: string }) => {
    return (
        <group>
             <Suspense fallback={<LoadingPlaceholder text={loadingText} />}>
                {/* Static Car Model with Garage Flag for correct trails. Removed key to prevent full remounts for speed. */}
                <CarModel color={car.color} carClass={car.class} visuals={car.visuals} isGarage={true} />
             </Suspense>
             
             {/* Static Floor */}
             <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                <planeGeometry args={[20, 20]} />
                <meshStandardMaterial color="#050505" roughness={0.1} metalness={0.5} />
            </mesh>
            
            {/* SpotLight fixed relative to world (or car), camera will orbit around it */}
            <spotLight position={[10, 10, 10]} angle={0.5} intensity={5} castShadow />
        </group>
    )
}

const Garage: React.FC<GarageProps> = ({ cars, onSelect, onBack, language }) => {
  const [currentCarIndex, setCurrentCarIndex] = useState(0);
  const [editedCar, setEditedCar] = useState<CarData>(cars[0]);
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const t = RESOURCES[language];

  useEffect(() => {
    setEditedCar(cars[currentCarIndex]);
  }, [currentCarIndex, cars]);

  const handleNext = () => setCurrentCarIndex((currentCarIndex + 1) % cars.length);
  const handlePrev = () => setCurrentCarIndex((currentCarIndex - 1 + cars.length) % cars.length);

  const cycleVisual = <K extends keyof VisualMods>(part: K, options: VisualMods[K][]) => {
      setEditedCar(prev => {
          const current = prev.visuals[part];
          const idx = options.indexOf(current);
          return { ...prev, visuals: { ...prev.visuals, [part]: options[(idx + 1) % options.length] } };
      });
  };

  const carName = t.cars[editedCar.name as keyof typeof t.cars] || editedCar.name;

  const baseCar = cars[currentCarIndex];
  const uniquePalette = Array.from(new Set([
      baseCar.color, 
      ...(editedCar.palette || [])
  ]));
  
  const NEON_OPTIONS: VisualMods['neon'][] = ['none', 'cyan', 'blue', 'purple', 'red', 'green'];

  return (
    <div className="relative w-full h-screen bg-black font-serif text-white overflow-hidden">
      <div className="absolute inset-0 z-0 top-0 h-[60vh] md:h-full">
        <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 45, position: [6, 3, 6] }}>
            <color attach="background" args={['#050505']} />
            <Environment preset="studio" />
            <ambientLight intensity={0.4} />
            <group position={[-2.5, -0.5, 0]}>
                <GarageSceneWrapper car={editedCar} loadingText={t.loadingModel} />
            </group>
            {/* AutoRotate enabled for camera orbit */}
            <OrbitControls enableZoom={false} maxPolarAngle={Math.PI / 2.2} target={[-2.5, 0, 0]} autoRotate autoRotateSpeed={2.0} />
        </Canvas>
      </div>

      <div className="absolute inset-0 z-10 p-6 md:p-12 flex flex-col justify-between pointer-events-none">
        <div className="pointer-events-auto w-full flex justify-between items-start">
            <button onClick={onBack} className="flex items-center gap-2 bg-transparent text-white/50 hover:text-white transition-all text-xs font-bold uppercase tracking-widest btn-glow"><ArrowLeft className="w-4 h-4" /> {t.back}</button>
        </div>

        {/* Bottom Container: Split Left (Stats) and Right (Start/Nav) */}
        <div className="flex flex-col md:flex-row items-end justify-between w-full mt-auto gap-8">
            
            {/* LEFT: Stats/Visuals Panel - Fixed Height, Compact */}
            <div className="pointer-events-auto bg-black/80 p-5 w-full md:w-80 h-64 flex flex-col gap-3 border border-white/5 mb-8 md:mb-0 shadow-2xl">
                <div className="flex w-full border-b border-white/10 pb-1 shrink-0">
                    {(['stats', 'visuals', 'paint'] as Tab[]).map(tabKey => (
                        <button key={tabKey} onClick={() => setActiveTab(tabKey)} className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === tabKey ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-white/30 hover:text-white'}`}>{tabKey}</button>
                    ))}
                </div>
                {/* Remove overflow-y-auto to disable scrolling entirely, relying on flex layout to fit */}
                <div className="flex-1 pr-1 flex flex-col overflow-hidden">
                    {activeTab === 'stats' && (
                        <div className="space-y-3 pt-3 h-full justify-center flex flex-col">
                            {(Object.keys(editedCar.stats) as Array<keyof CarStats>).map(stat => (
                                <div key={stat} className="space-y-1">
                                    <div className="flex justify-between text-[10px] uppercase tracking-widest text-white/70"><span>{t.stats[stat]}</span><span className="text-cyan-400">{Math.floor(editedCar.stats[stat])}</span></div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 h-1 bg-white/10 overflow-hidden"><div className="h-full bg-white" style={{ width: `${editedCar.stats[stat]}%` }} /></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* VISUALS */}
                    {activeTab === 'visuals' && (
                        <div className="flex flex-col h-full gap-3 pt-3">
                           {['body', 'spoiler', 'rims'].map((part) => (
                               <div key={part} className="flex-1">
                                    <button onClick={() => cycleVisual(part as any, part === 'body' ? ['stock', 'wide', 'track'] : part === 'spoiler' ? ['none', 'mid', 'high', 'wing'] : ['stock', 'aero', 'spoke'])} 
                                        className="w-full h-full text-left px-4 hover:bg-white/5 flex justify-between items-center text-xs uppercase font-bold tracking-widest transition-colors btn-glow border border-white/5" style={{ color: 'white' }}>
                                        <span className="opacity-70">{t.visuals[part as keyof typeof t.visuals]}</span>
                                        <div className="flex items-center gap-2">
                                            <span>{editedCar.visuals[part as keyof VisualMods]}</span>
                                            <ChevronRight className="w-3 h-3 text-cyan-400" />
                                        </div>
                                    </button>
                               </div>
                           ))}
                        </div>
                    )}

                    {/* PAINT: Fully Flexed Layout - Restored Squares */}
                    {activeTab === 'paint' && (
                        <div className="w-full h-full flex flex-col py-1 gap-1">
                            {/* Row 1: Body Color - Flex 1 */}
                            <div className="flex-1 flex flex-col justify-center min-h-0">
                                <span className="text-[10px] uppercase tracking-widest opacity-50 pl-1 mb-1">{t.visuals.body} {t.color}</span>
                                {/* Removed no-scrollbar to let custom styled scrollbar show */}
                                <div className="flex gap-2 overflow-x-auto px-1 w-full snap-x items-center pb-1">
                                    {uniquePalette.map((color, i) => (
                                        <button key={i} onClick={() => setEditedCar({...editedCar, color})} 
                                            // Scale down on select (scale-90), Square shape (w-9 h-9)
                                            className={`flex-shrink-0 w-9 h-9 transition-all duration-300 snap-center rounded-sm ${editedCar.color === color ? 'border-2 border-cyan-400 scale-90 opacity-100 shadow-[0_0_10px_rgba(0,255,255,0.3)]' : 'border border-white/20 hover:border-white opacity-70 hover:opacity-100'}`} 
                                            style={{ backgroundColor: color }} 
                                        />
                                    ))}
                                </div>
                            </div>
                            
                            {/* Row 2: Neon Color - Flex 1 */}
                            <div className="flex-1 flex flex-col justify-center min-h-0 border-t border-white/5 pt-1">
                                <span className="text-[10px] uppercase tracking-widest opacity-50 pl-1 mb-1">{t.visuals.neon}</span>
                                {/* Removed no-scrollbar */}
                                <div className="flex gap-2 overflow-x-auto px-1 w-full snap-x items-center pb-1">
                                    {NEON_OPTIONS.map((neon, i) => {
                                        // Bright, distinct colors for icon glow
                                        const glowColor = neon === 'cyan' ? '#00ffff' : neon === 'red' ? '#ff0000' : neon === 'green' ? '#00ff00' : neon === 'blue' ? '#0066ff' : neon === 'purple' ? '#cc00ff' : 'transparent';
                                        
                                        return (
                                        <button key={i} onClick={() => setEditedCar(prev => ({ ...prev, visuals: { ...prev.visuals, neon: neon } }))} 
                                            // Scale down on select (scale-90), Square shape (w-9 h-9)
                                            className={`flex-shrink-0 w-9 h-9 transition-all duration-300 snap-center rounded-sm flex items-center justify-center bg-[#111] ${editedCar.visuals.neon === neon ? 'border-2 border-cyan-400 scale-90 opacity-100 shadow-[0_0_10px_rgba(0,255,255,0.3)]' : 'border border-white/20 hover:border-white opacity-70 hover:opacity-100'}`}
                                        >
                                            {neon === 'none' ? (
                                                <div className="w-5 h-px bg-red-500 rotate-45" />
                                            ) : (
                                                <div className="w-3 h-3 rounded-full" style={{ 
                                                    backgroundColor: glowColor,
                                                    boxShadow: `0 0 10px ${glowColor}, 0 0 2px ${glowColor}`
                                                }} />
                                            )}
                                        </button>
                                    )})}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: Car Selector + Start Button */}
            <div className="pointer-events-auto flex flex-col items-end gap-6 w-full md:w-auto">
                <div className="flex flex-col text-right mb-4">
                    <span className="text-4xl font-black italic uppercase whitespace-nowrap overflow-hidden text-ellipsis" style={{ textShadow: `0 0 20px ${editedCar.visuals.neon === 'none' ? 'white' : editedCar.visuals.neon}` }}>{carName}</span>
                    <span className="text-xs uppercase tracking-[0.2em] text-white/50 mt-1">CLASS {editedCar.class}</span>
                </div>
                
                <div className="flex items-center gap-8">
                     <button onClick={handlePrev} className="w-12 h-12 hover:text-cyan-400 text-white flex items-center justify-center transition-colors btn-glow"><ChevronLeft className="w-8 h-8" /></button>
                     <button onClick={() => onSelect(editedCar)} className="flex items-center gap-3 text-black px-12 py-6 hover:text-cyan-400 transition-all group btn-glow" style={{ color: 'cyan' }}>
                        <span className="text-xl font-black uppercase italic tracking-widest">{t.start}</span>
                    </button>
                    <button onClick={handleNext} className="w-12 h-12 hover:text-cyan-400 text-white flex items-center justify-center transition-colors btn-glow"><ChevronRight className="w-8 h-8" /></button>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
export default Garage;
