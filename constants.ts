
import { CarClass, CarData } from './types';

const PALETTES = {
  MONOCHROME_GLITCH: ['#FFFFFF', '#EAEAEA', '#C0C0C0', '#808080', '#404040', '#1A1A1A'],
  RACING_LEGENDS: ['#D40000', '#0033A0', '#FFD700', '#009B48', '#FF6700', '#C0C0C0'],
  TOKYO_NEON: ['#FF00FF', '#00FFFF', '#39FF14', '#F9A825', '#FF3F81', '#6E00FF'],
  IMPERIAL_GOLD: ['#FFD700', '#4B0082', '#8A2BE2', '#000080', '#B22222', '#FFFFFF'],
  CYBERPUNK_HAZE: ['#EA00D9', '#00F0FF', '#FFFF00', '#7FFF00', '#FF5F1F', '#A239EA'],
  SUPERNOVA_FLARE: ['#FF4500', '#FFD700', '#FF6347', '#DC143C', '#FFFF00', '#FF8C00'],
  RETRO_SUNSET: ['#FF0055', '#FF5500', '#FFAA00', '#FFFF00', '#5500FF', '#0000FF'],
  ACID_RAIN: ['#CCFF00', '#00FF66', '#00FFFF', '#5000FF', '#FF00CC', '#111111'],
  NEON_JUNGLE: ['#39FF14', '#00FF00', '#1F51FF', '#FF00FF', '#FFFF00', '#0B0B0B'],
  DEEP_SPACE: ['#000033', '#000066', '#330099', '#6600CC', '#9900FF', '#CC00FF'],
  VAPOR_WAVE: ['#FF71CE', '#01CDFE', '#05FFA1', '#B967FF', '#FFFB96', '#FFFFFF'],
  CANDY_CRUSH: ['#FF69B4', '#FF1493', '#00BFFF', '#ADFF2F', '#FFD700', '#FF4500'],
  VOID_EATER: ['#000000', '#1C1C1C', '#333333', '#4F4F4F', '#FF0000', '#FFFFFF'],
  QUANTUM_FLUX: ['#00FFFF', '#0099FF', '#0033FF', '#000099', '#FF00FF', '#FFFFFF'],
  SYNTAX_ERROR: ['#00FF00', '#003300', '#000000', '#FFFFFF', '#FF00FF', '#FFFF00'],
  DREAM_WEAVER: ['#E6E6FA', '#D8BFD8', '#DDA0DD', '#EE82EE', '#FF00FF', '#9400D3'],
  PLASMA_BURN: ['#FF4500', '#FF8C00', '#FFAA00', '#FFFF00', '#E0FFFF', '#FFFFFF'],
  DIGITAL_ROT: ['#8B008B', '#800080', '#4B0082', '#483D8B', '#2F4F4F', '#000000'],
  MIDNIGHT_RUN: ['#191970', '#000080', '#483D8B', '#6A5ACD', '#7B68EE', '#9370DB'],
  SOLAR_FLARE: ['#FFD700', '#FFA500', '#FF8C00', '#FF4500', '#FF6347', '#E9967A'],
  POISON_IVY: ['#006400', '#008000', '#228B22', '#32CD32', '#90EE90', '#98FB98'],
  ARCTIC_FROST: ['#F0FFFF', '#E0FFFF', '#AFEEEE', '#7FFFD4', '#40E0D0', '#00CED1'],
  HOT_PINK_PUNK: ['#FF69B4', '#FF1493', '#C71585', '#DB7093', '#FFC0CB', '#FFB6C1'],
  ULTRA_VIOLENCE: ['#FF0000', '#990000', '#FF3333', '#CC0000', '#660000', '#330000'],
  ELECTRIC_DREAMS: ['#007BFF', '#0056b3', '#00BFFF', '#1E90FF', '#87CEEB', '#B0E0E6']
};

export const INITIAL_CARS: CarData[] = [
  {
    id: 'starter_01',
    name: 'starter_01', 
    class: CarClass.D,
    color: PALETTES.MONOCHROME_GLITCH[0],
    stats: { speed: 45, accel: 55, handling: 35, nitro: 30 },
    visuals: { spoiler: 'none', body: 'stock', rims: 'stock', neon: 'cyan' },
    level: 1,
    blueprints: 0,
    palette: [...PALETTES.MONOCHROME_GLITCH, ...PALETTES.ELECTRIC_DREAMS],
  },
  {
    id: 'muscle_02',
    name: 'muscle_02',
    class: CarClass.C,
    color: PALETTES.RACING_LEGENDS[0],
    stats: { speed: 60, accel: 45, handling: 45, nitro: 50 },
    visuals: { spoiler: 'mid', body: 'wide', rims: 'spoke', neon: 'blue' },
    level: 1,
    blueprints: 0,
    palette: [...PALETTES.PLASMA_BURN, ...PALETTES.SOLAR_FLARE],
  },
  {
    id: 'tuner_03',
    name: 'tuner_03',
    class: CarClass.B,
    color: PALETTES.TOKYO_NEON[5],
    stats: { speed: 72, accel: 70, handling: 60, nitro: 60 },
    visuals: { spoiler: 'high', body: 'track', rims: 'aero', neon: 'purple' },
    level: 1,
    blueprints: 0,
    palette: [...PALETTES.SYNTAX_ERROR, ...PALETTES.MIDNIGHT_RUN],
  },
  {
    id: 'tank_04',
    name: 'tank_04',
    class: CarClass.A,
    color: PALETTES.SUPERNOVA_FLARE[0],
    stats: { speed: 82, accel: 35, handling: 75, nitro: 90 },
    visuals: { spoiler: 'none', body: 'stock', rims: 'stock', neon: 'red' },
    level: 1,
    blueprints: 0,
    palette: [...PALETTES.DIGITAL_ROT, ...PALETTES.POISON_IVY],
  },
  {
    id: 'hyper_05',
    name: 'hyper_05',
    class: CarClass.S,
    color: PALETTES.IMPERIAL_GOLD[5],
    stats: { speed: 98, accel: 90, handling: 85, nitro: 80 },
    visuals: { spoiler: 'wing', body: 'track', rims: 'aero', neon: 'cyan' },
    level: 1,
    blueprints: 0,
    palette: [...PALETTES.QUANTUM_FLUX, ...PALETTES.ARCTIC_FROST],
  },
  {
    id: 'ultimate_06',
    name: 'ultimate_06',
    class: CarClass.S,
    color: PALETTES.CYBERPUNK_HAZE[0],
    stats: { speed: 100, accel: 100, handling: 90, nitro: 100 },
    visuals: { spoiler: 'wing', body: 'track', rims: 'aero', neon: 'green' },
    level: 1,
    blueprints: 0,
    palette: [...PALETTES.VOID_EATER, ...PALETTES.ULTRA_VIOLENCE, ...PALETTES.HOT_PINK_PUNK],
  }
];

export const TRACK_LENGTH = 60000; 
export const GRAVITY = -15;

export const EMOJI_POOL = [
  '⚡','🔥','💎','☠️','👾','🤖','👁️','🧠','💣','💥','🌀','🌌','🪐','🌑','🩸','🧬'
];
