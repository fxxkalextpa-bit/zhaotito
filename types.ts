
export type Language = 'zh_CN' | 'zh_TW' | 'ja' | 'en' | 'ko';

export enum GameState {
  MENU = 'MENU',
  GARAGE = 'GARAGE',
  RACE = 'RACE',
  RESULTS = 'RESULTS'
}

export enum CarClass {
  D = 'D',
  C = 'C',
  B = 'B',
  A = 'A',
  S = 'S'
}

export interface CarStats {
  speed: number;    // Max Speed
  accel: number;    // Acceleration
  handling: number; // Turning sharpness
  nitro: number;    // Nitro efficiency/capacity
}

export interface VisualMods {
  spoiler: 'none' | 'mid' | 'high' | 'wing';
  body: 'stock' | 'wide' | 'track';
  rims: 'stock' | 'aero' | 'spoke';
  neon: 'none' | 'blue' | 'red' | 'purple' | 'green' | 'cyan';
}

export interface CarData {
  id: string;
  name: string;
  class: CarClass;
  color: string;
  stats: CarStats;
  visuals: VisualMods;
  level: number;
  blueprints: number;
  palette?: string[];
}

export interface RaceResult {
  position: number;
  time: number; // seconds
  rewards: {
    credits: number;
    blueprints: number;
  };
}

export interface TelemetryData {
    speed: number; 
    nitro: number; 
    progress: number; 
    rank: number;
    lap: number;        // Current Lap
    totalLaps: number;  // Total Laps
    player: { x: number; z: number; rot: number };
    opponents: { id: string; x: number; z: number }[];
    currentTheme: ThemeType; 
    isGlitching: boolean; 
    isDrifting: boolean; 
    isPerfectNitro: boolean;
    damage: number;
    // New Stats
    stats: {
        maxSpeed: number;
        maxDriftTime: number;
        collisions: number;
    }
}

export type ThemeType = 'mist' | 'concrete' | 'void' | 'marble' | 'ocean' | 'sanctuary';

export interface SurrealTheme {
  audioMood: 'calm' | 'tense' | 'chaotic' | 'ethereal';
  fx: {
    distort: number;
    speed: number;
    aberration: number;
    bloom: number;
  };
  colors: {
    sky: string;
    fog: string;
    road: string;
    wall: string;
    light: string;
  };
  sun: {
    position: [number, number, number];
    color: string;
    intensity: number;
  };
}
