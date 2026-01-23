
import * as THREE from 'three';
import { ThemeType } from '../types';
import { EMOJI_POOL } from '../constants';

export interface SegmentData {
    index: number;
    position: THREE.Vector3;
    rotation: THREE.Euler;
    width: number;
    groundEmoji?: { char: string, offset: number, size: number, rotation: number };
    normal: THREE.Vector3;
    tangent: THREE.Vector3;
    theme: ThemeType;
}

// Deterministic Random Number Generator
const SEED_RANDOM = (seed: number) => {
    let s = seed % 2147483647;
    return () => {
        s = s * 16807 % 2147483647;
        return (s - 1) / 2147483646;
    };
};

export const generateTrackPath = (seed: number = 1): { main: SegmentData[] } => {
    const rng = SEED_RANDOM(seed);
    const segments: SegmentData[] = [];
    const TOTAL_SEGMENTS = 1200; 

    // --- TRACK GENERATION ---
    const radiusX = 1200; 
    const radiusZ = 800;

    const points: THREE.Vector3[] = [];
    
    for (let i = 0; i <= TOTAL_SEGMENTS; i++) {
        const t = (i / TOTAL_SEGMENTS) * Math.PI * 2;
        const noise = (Math.sin(t * 10) * 10); 
        const x = Math.cos(t) * (radiusX + noise);
        const z = Math.sin(t) * (radiusZ + noise);
        const y = 0; 
        points.push(new THREE.Vector3(x, y, z));
    }

    for (let i = 0; i < TOTAL_SEGMENTS; i++) {
        const pos = points[i];
        
        // Calculate Tangent
        const prev = points[(i - 1 + TOTAL_SEGMENTS) % TOTAL_SEGMENTS];
        const next = points[(i + 1) % TOTAL_SEGMENTS];
        const tangent = next.clone().sub(prev).normalize();

        const up = new THREE.Vector3(0, 1, 0);
        const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();

        // Construct Rotation Matrix
        const rotMat = new THREE.Matrix4();
        rotMat.makeBasis(normal, up, tangent.clone().negate());
        
        const rotation = new THREE.Euler();
        rotation.setFromRotationMatrix(rotMat);

        // Decoration
        let groundEmoji;
        // REDUCED DENSITY: Reduced from 50 to 100 (Quarter of original)
        if (i % 100 === 0 && rng() > 0.4) {
            const char = EMOJI_POOL[Math.floor(rng() * EMOJI_POOL.length)];
            const width = 50; 
            const offset = (rng() - 0.5) * (width - 10);
            groundEmoji = { 
                char, 
                offset, 
                size: 20 + rng() * 10, 
                rotation: rng() * Math.PI * 2 
            };
        }

        segments.push({
            index: i,
            position: pos,
            rotation: rotation,
            width: 60,
            normal: normal,
            tangent: tangent,
            groundEmoji,
            theme: 'mist'
        });
    }

    return { main: segments };
};
