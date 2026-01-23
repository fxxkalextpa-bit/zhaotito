
/// <reference lib="dom" />
import React, { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Environment, Text } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import { CarData, CarClass, ThemeType, SurrealTheme, TelemetryData } from '../types';
import { INITIAL_CARS, EMOJI_POOL } from '../constants';
import { RaceVisuals, InvertEffect } from './RaceVisuals';
import { CarModel } from './CarModels';
import { ParticleBurst, ExplosionManager } from './ParticleSystem';
import { RacingCamera } from './CameraSystem';
import { Language, RESOURCES } from '../locales';
import { generateTrackPath, SegmentData } from './TrackGenerator';
import { TrackLayer, resolveTrackCollision } from './TrackSystem';

export type { SegmentData };

// --- Types & Globals ---
export type ThemeColors = SurrealTheme['colors'];
const damp = (value: number, target: number, step: number) => {
  const diff = target - value;
  return value + diff * Math.min(1, step);
};

interface PhysicsState {
    id: string; position: THREE.Vector3; velocity: THREE.Vector3;
    speed: number; radius: number; progress: number;
}
type RegisterPhysics = (id: string, state: PhysicsState) => void;
type GetPhysicsStates = () => Map<string, PhysicsState>;

// --- Helper for Random Theme Colors ---
export const getRandomThemeColors = (): ThemeColors => {
    const hues = [0, 0.1, 0.3, 0.5, 0.6, 0.8];
    const pick = () => hues[Math.floor(Math.random() * hues.length)];
    const baseH = pick();
    
    // Generate a psychedelic palette
    const c1 = new THREE.Color().setHSL(baseH, 1.0, 0.1).getHexString(); // Sky (Dark)
    const c2 = new THREE.Color().setHSL((baseH + 0.5)%1, 0.8, 0.1).getHexString(); // Fog
    const c3 = new THREE.Color().setHSL((baseH + 0.2)%1, 1.0, 0.5).getHexString(); // Road (Neon)
    const c4 = new THREE.Color().setHSL((baseH + 0.7)%1, 1.0, 0.5).getHexString(); // Wall
    
    return {
        sky: '#' + c1,
        fog: '#' + c2,
        road: '#' + c3,
        wall: '#' + c4,
        light: '#ffffff'
    };
};

// --- CAR COMPONENT ---
interface CarProps {
  isPlayer?: boolean; carData: CarData;
  onRaceUpdate?: (data: TelemetryData) => void; onRaceEnd?: () => void;
  registerPhysics: RegisterPhysics; getPhysicsStates: GetPhysicsStates;
  trackPath: SegmentData[];
  onCollision: () => void;
  virtualKeys?: { w: boolean, a: boolean, s: boolean, d: boolean, space: boolean, shift: boolean };
  playerProgressRef?: React.MutableRefObject<number>;
  nitroAmountRef?: React.MutableRefObject<number>; // Shared nitro ref
  nitroBufferRef?: React.MutableRefObject<number>; // Buffer for smooth filling
  canMove?: boolean; // For countdown
  isPaused?: boolean;
  startOffset?: number; 
}

const Car = React.memo(({ isPlayer, carData, onRaceUpdate, onRaceEnd, registerPhysics, getPhysicsStates, trackPath, onCollision, virtualKeys, playerProgressRef, nitroAmountRef, nitroBufferRef, canMove = true, isPaused, startOffset = 0 }: CarProps) => {
  const group = useRef<THREE.Group>(null);
  
  // Initialize position based on track start
  const [initialInit] = useState(() => {
     const startSeg = trackPath[startOffset % trackPath.length];
     const pos = startSeg.position.clone();
     pos.y += 2.0;
     // Offset sideways based on "grid" position
     if (!isPlayer) {
         pos.addScaledVector(startSeg.normal, (Math.random() - 0.5) * 20);
     }
     const rot = startSeg.rotation.clone();
     rot.y += Math.PI; 
     
     return { pos, rot };
  });

  const speed = useRef(0), verticalVelocity = useRef(0);
  // Use shared nitro ref if player, else local. 
  // CHANGED: Nitro Max is now 150 (1.5x of previous 100).
  const localNitro = useRef(150);
  const nitroAmount = isPlayer && nitroAmountRef ? nitroAmountRef : localNitro;
  const localNitroBuffer = useRef(0);
  const nitroBuffer = isPlayer && nitroBufferRef ? nitroBufferRef : localNitroBuffer;
  
  // Track if nitro is completely empty to prevent flickering on/off
  const isNitroEmpty = useRef(false);

  const isNitroEnabled = useRef(false), isPerfectNitro = useRef(false);
  const currentSteering = useRef(0); // This ref will also drive visual rotation
  
  // Physics smoothing refs
  const steeringVel = useRef(0);
  const driftFactor = useRef(0);

  const currentProgress = useRef(startOffset);
  const currentLap = useRef(1);
  const totalLaps = 3;
  
  // Track previous progress index to detect wrap-around (lap completion)
  const lastProgressIndex = useRef(startOffset);
  
  const isDrifting = useRef(false);
  // State to track wall contact
  const isWallGrinding = useRef(false);
  const wallContactSide = useRef<'left' | 'right' | 'none'>('none');

  const damage = useRef(0); // 0-100
  const keys = useRef({ w: false, a: false, s: false, d: false, space: false, shift: false });
  const carYaw = useRef(initialInit.rot.y);
  
  const trauma = useRef(0);
  const isWrecked = useRef(false);
  const wreckTimer = useRef(0);
  const sessionStats = useRef({ maxSpeed: 0, currentDrift: 0, maxDriftTime: 0, collisions: 0 });

  const aiState = useRef({ 
      offset: (Math.random() - 0.5) * 15, 
      aggressiveness: 0.8 + Math.random() * 0.4
  }).current;

  // Manual positioning logic instead of purely index-based
  const currentPosVector = useRef(initialInit.pos.clone());

  useEffect(() => {
    if (!isPlayer) return;
    const keyMap: { [key: string]: keyof typeof keys.current } = { KeyW: 'w', ArrowUp: 'w', KeyA: 'a', ArrowLeft: 'a', KeyS: 's', ArrowDown: 's', KeyD: 'd', ArrowRight: 'd', Space: 'space' };
    const onKeyDown = (e: KeyboardEvent) => { if (keyMap[e.code]) keys.current[keyMap[e.code]] = true; if (e.code.startsWith('Shift') && !e.repeat) keys.current.shift = !keys.current.shift; };
    const onKeyUp = (e: KeyboardEvent) => { if (keyMap[e.code]) keys.current[keyMap[e.code]] = false; };
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [isPlayer]);

  useFrame((state, delta) => {
    if (isPaused) return; 
    if (!group.current || delta > 0.1) return;
    
    // 1. Current State
    const pos = currentPosVector.current;
    
    // Damage Recovery Logic
    // Slower recovery: 10 per second = 10 seconds to recover full health
    if (damage.current > 0) damage.current = Math.max(0, damage.current - delta * 10);
    if (isPlayer) trauma.current = Math.max(0, trauma.current - delta * 3.0);

    // Wreck Logic
    if (isWrecked.current) {
        wreckTimer.current -= delta;
        speed.current = 0;
        group.current.rotation.y += delta * 10;
        if (wreckTimer.current <= 0) {
            isWrecked.current = false;
            damage.current = Math.min(100, damage.current + 20); 
            // Reset to track center
            const seg = trackPath[Math.floor(currentProgress.current) % trackPath.length];
            pos.copy(seg.position);
            pos.y += 2.0;
            carYaw.current = seg.rotation.y + Math.PI; 
            currentSteering.current = 0;
            steeringVel.current = 0;
            verticalVelocity.current = 0;
        }
        group.current.position.copy(pos);
        return; 
    }

    // 2. Find Closest Segment (Broadphase)
    let bestIdx = Math.floor(currentProgress.current);
    let minDist = 10000;
    const searchRad = 30; 
    for (let i = -searchRad; i <= searchRad; i++) {
        let idx = (Math.floor(currentProgress.current) + i);
        if (idx < 0) idx += trackPath.length;
        idx = idx % trackPath.length;
        
        const dist = pos.distanceToSquared(trackPath[idx].position);
        if (dist < minDist) {
            minDist = dist;
            bestIdx = idx;
        }
    }

    // Lap Counting Logic - Detect Wrap Around
    // If we jumped from end of track to beginning
    if (lastProgressIndex.current > trackPath.length * 0.9 && bestIdx < trackPath.length * 0.1) {
        currentLap.current++;
    } 
    // If we went backwards from start to end
    else if (lastProgressIndex.current < trackPath.length * 0.1 && bestIdx > trackPath.length * 0.9) {
        currentLap.current--;
    }
    
    lastProgressIndex.current = bestIdx;
    currentProgress.current = bestIdx;
    const seg = trackPath[bestIdx];
    const trackY = seg.position.y;


    // 3. Handle Input & Speed Calculation
    const { accel, handling: baseHandling, speed: maxS } = carData.stats;
    const autoGas = isPlayer && canMove;

    const input = { 
        w: autoGas || ((keys.current.w || (virtualKeys?.w ?? false)) && canMove),
        a: (keys.current.a || (virtualKeys?.a ?? false)) && canMove,
        s: (keys.current.s || (virtualKeys?.s ?? false)) && canMove,
        d: (keys.current.d || (virtualKeys?.d ?? false)) && canMove,
        space: (keys.current.space || (virtualKeys?.space ?? false)) && canMove,
        shift: (keys.current.shift || (virtualKeys?.shift ?? false)) && canMove
    };

    // Calculate Target Steer (-1 to 1) for Physics
    let targetSteer = 0;
    if (input.a) targetSteer = 1;
    if (input.d) targetSteer = -1;
    
    // --- INPUT LOCKING (Rule: Can't turn into the wall you are grinding) ---
    if (isWallGrinding.current) {
        if (wallContactSide.current === 'left' && targetSteer === 1) targetSteer = 0;
        if (wallContactSide.current === 'right' && targetSteer === -1) targetSteer = 0;
    }

    let targetS = 0;
    const currentMaxSpeed = maxS * 1.6;

    if (isPlayer) {
        if (input.s) targetS = 0; 
        else if (input.w) targetS = currentMaxSpeed;
        
        // --- NITRO LOGIC UPDATE (Non-Linear Ease-out) ---
        
        // Handle Buffer Drain (Smooth Filling with Ease-out)
        if (nitroBuffer.current > 0) {
            // Fill rate is proportional to remaining buffer size.
            // High buffer = Fast fill. Low buffer = Slow fill.
            // +15.0 provides a minimum speed so it actually finishes.
            const fillRate = (nitroBuffer.current * 5.0 + 15.0) * delta; 
            const toFill = Math.min(nitroBuffer.current, fillRate);
            
            // Check overflow against max 150
            const spaceLeft = 150 - nitroAmount.current;
            const actualFill = Math.min(toFill, spaceLeft);
            
            nitroAmount.current += actualFill;
            nitroBuffer.current -= actualFill;
            
            // If we hit max, clear buffer
            if (nitroAmount.current >= 150) nitroBuffer.current = 0;
        }

        // 1. If key released, clear empty flag
        if (!input.shift) {
             isNitroEmpty.current = false;
        }

        // 2. Consume if key held AND not previously flagged empty
        if (input.shift && nitroAmount.current > 0 && !isNitroEmpty.current) {
            isNitroEnabled.current = true;
            targetS *= 1.5;
            nitroAmount.current -= delta * 30;
            
            // If we hit zero, flag it. This flag requires key release to clear.
            if (nitroAmount.current <= 0) {
                nitroAmount.current = 0;
                isNitroEmpty.current = true;
                isNitroEnabled.current = false;
            }
        } else {
            isNitroEnabled.current = false;
            // 3. Regeneration: Max 150. Rate Halved (2.5 instead of 5)
            nitroAmount.current = Math.min(150, nitroAmount.current + delta * 2.5);
        }
    } else if (canMove) { // AI Move
        targetS = currentMaxSpeed * aiState.aggressiveness;
        // AI Steering
        const segNext = trackPath[Math.floor(currentProgress.current + 8) % trackPath.length];
        const vecToNext = segNext.position.clone().sub(pos).normalize();
        const forward = new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0), carYaw.current);
        const cross = forward.clone().cross(vecToNext).y;
        if (cross > 0.05) targetSteer = 1;
        else if (cross < -0.05) targetSteer = -1;
        else targetSteer = 0;
    }

    isDrifting.current = input.space && speed.current > 40; 
    
    // --- DAMAGE PENALTY ---
    // Max 20% speed reduction at 100 damage
    const damagePenalty = 1.0 - (damage.current / 100) * 0.20;
    targetS *= damagePenalty;

    // --- ACCELERATION & INSTANT DECELERATION LOGIC ---
    // Detect if we are slowing down (current speed > target speed)
    // This happens when Nitro ends or player lets go of W
    const isDecelerating = speed.current > targetS;
    
    // Normal Acceleration Time
    const timeToReachMax = (6.0 - (Math.min(100, accel) / 100.0) * 2.0) / 2.0;
    const accelStep = delta / timeToReachMax;
    
    // SNAP DECELERATION: If slowing down (especially from Nitro), use 10x friction
    const decelStep = delta * 10.0; 
    const finalStep = isDecelerating ? decelStep : accelStep;
    
    speed.current = damp(speed.current, targetS, finalStep);

    // 4. Calculate Velocity Vector & Smooth Steering
    
    // STEERING SMOOTHING (Inertia Fade In/Out)
    // Lerp factor controls the "weight"
    const steerSmoothing = 5.0 * delta; 
    const maxTurnSpeed = (baseHandling / 100) * 2.8; 
    
    // Accumulate steering velocity (radians per second)
    const targetTurnVelocity = targetSteer * maxTurnSpeed;
    steeringVel.current = damp(steeringVel.current, targetTurnVelocity, steerSmoothing);
    
    // Apply Yaw
    carYaw.current += steeringVel.current * delta;

    // DRIFT SMOOTHING
    let targetDrift = 0;
    if (isDrifting.current) {
        targetDrift = input.a ? 1 : (input.d ? -1 : 0);
    }
    // Drift inertia is slightly snappier than steering but still smooth to prevent "teleporting"
    driftFactor.current = damp(driftFactor.current, targetDrift, 8.0 * delta);

    // Base Velocity (Car Local Forward)
    let moveVec = new THREE.Vector3(0, 0, -speed.current).applyAxisAngle(new THREE.Vector3(0,1,0), carYaw.current);
    
    // Apply Smoothed Drift Vector
    if (Math.abs(driftFactor.current) > 0.01) {
        const slideForce = 15.0 * driftFactor.current;
        const slideVec = new THREE.Vector3(slideForce, 0, 0).applyAxisAngle(new THREE.Vector3(0,1,0), carYaw.current);
        moveVec.add(slideVec);
    }
    
    // 5. Collision & Position Update (Using new TrackSystem with Constraint Logic)
    // We pass velocity so it can be corrected (slide)
    const collision = resolveTrackCollision(pos, moveVec, seg, 2.0); // 2.0 width car
    
    if (collision.didCollide) {
        // --- ROBUST COLLISION RESPONSE ---
        // 1. Correct Position (Soft Buffer)
        pos.copy(collision.correctedPosition);
        
        // 2. Correct Velocity (Bounce + Friction)
        moveVec.copy(collision.correctedVelocity);
        
        // 3. Update Scalar Speed to match new Velocity (Prevent acceleration into wall)
        speed.current = moveVec.length();

        // 4. Kill Angular Momentum (Prevents Spin)
        steeringVel.current = 0; 

        // 5. Align Heading with new Velocity (Slide along wall)
        // This ensures the car's orientation updates to match the "bounce" direction, 
        // preventing it from driving back into the wall in the next frame.
        if (speed.current > 1.0) {
             // Calculate target yaw from velocity vector (Standard -Z forward)
             const targetYaw = Math.atan2(moveVec.x, moveVec.z) + Math.PI;
             carYaw.current = targetYaw;
        }
        
        // 6. Set State
        isWallGrinding.current = true;
        wallContactSide.current = collision.side;

        // 7. Effects
        // More damage on impact (15 instead of 0.5) to make hits matter
        damage.current = Math.min(100, damage.current + 15);
        trauma.current = Math.min(1.0, trauma.current + 0.3);
        if (onCollision && Math.random() > 0.7) onCollision(); 
    } else {
        isWallGrinding.current = false;
        wallContactSide.current = 'none';
    }
    
    // Apply resolved movement
    pos.addScaledVector(moveVec, delta);

    // 6. Gravity / Height Logic
    verticalVelocity.current -= 50 * delta;
    const distToTrack = pos.y - trackY;
    const suspensionHeight = 1.5;
    
    if (distToTrack < 10.0 && distToTrack > -5.0) {
        if (verticalVelocity.current < 0) {
             pos.y = damp(pos.y, trackY + suspensionHeight, 0.8);
             verticalVelocity.current = 0;
        } else {
             pos.y += verticalVelocity.current * delta;
             if (distToTrack < 2.0) {
                 pos.y = trackY + suspensionHeight;
                 verticalVelocity.current = 0;
             }
        }
    } else {
        pos.y += verticalVelocity.current * delta;
    }

    // 7. Visual Update
    const trackUp = new THREE.Vector3().crossVectors(seg.tangent, seg.normal).normalize();
    const targetQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), trackUp);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), carYaw.current);
    const finalQ = targetQ.multiply(yawQ);
    
    // Update Visual Ref for CarModel (Normalized -1 to 1)
    // Pass the ratio of current turning speed to max turning speed so visuals match physics exactly
    if (maxTurnSpeed > 0.001) {
        currentSteering.current = steeringVel.current / maxTurnSpeed;
    } else {
        currentSteering.current = 0;
    }

    if (group.current) {
        group.current.position.copy(pos);
        if (damage.current > 70) {
             const shake = (damage.current - 70) / 30 * 0.05;
             group.current.position.x += (Math.random() - 0.5) * shake;
             group.current.position.y += (Math.random() - 0.5) * shake;
        }
        group.current.quaternion.slerp(finalQ, delta * 15);
    }
    
    if (isPlayer && registerPhysics) {
        registerPhysics('player', { id: 'player', position: pos, velocity: moveVec, speed: speed.current, radius: 2.5, progress: currentProgress.current });
    }

    if (isPlayer) {
        if (playerProgressRef) playerProgressRef.current = (currentProgress.current % trackPath.length) / trackPath.length;
        if (onRaceUpdate) {
             onRaceUpdate({ 
                 speed: Math.abs(Math.floor(speed.current * 2.2)), 
                 nitro: nitroAmount.current, 
                 progress: playerProgressRef?.current * 100 || 0, 
                 rank: 1, 
                 lap: currentLap.current,
                 totalLaps: totalLaps,
                 player: { x: pos.x, z: pos.z, rot: carYaw.current }, 
                 opponents: [], 
                 currentTheme: seg.theme || 'mist', 
                 isGlitching: false, 
                 isDrifting: isDrifting.current, 
                 isPerfectNitro: isPerfectNitro.current,
                 damage: damage.current,
                 stats: sessionStats.current
             });
        }
    }
  });

  return (
    <group ref={group}>
       <CarModel 
        color={carData.color} 
        carClass={carData.class} 
        visuals={carData.visuals} 
        driftRef={isDrifting} 
        damageRef={damage}
        steeringRef={currentSteering}
       />
       {isPlayer && (
           <RacingCamera 
                targetGroupRef={group}
                speedRef={speed}
                steeringRef={currentSteering}
                driftRef={isDrifting}
                nitroRef={isNitroEnabled}
                traumaRef={trauma}
           />
       )}
    </group>
  );
});

// Helper for collision calculation
function vecToCarDot(pos: THREE.Vector3, seg: SegmentData) {
    const v = pos.clone().sub(seg.position);
    return v.dot(seg.normal);
}

const CollisionDetector = ({
  physicsState,
  trackPath,
  collectedIndices,
  setCollectedIndices,
  setExplosions,
  nitroBufferRef,
  isPaused
}: {
  physicsState: React.MutableRefObject<Map<string, PhysicsState>>;
  trackPath: SegmentData[];
  collectedIndices: Set<number>;
  setCollectedIndices: React.Dispatch<React.SetStateAction<Set<number>>>;
  setExplosions: React.Dispatch<React.SetStateAction<any[]>>;
  nitroBufferRef?: React.MutableRefObject<number>;
  isPaused?: boolean;
}) => {
  useFrame(() => {
    if (isPaused) return;
    const playerState = physicsState.current.get('player');
    if (playerState && trackPath.length > 0) {
         const currentIndex = Math.floor(playerState.progress) % trackPath.length;
         for(let i = -5; i <= 5; i++) {
             const idx = (currentIndex + i + trackPath.length) % trackPath.length;
             const seg = trackPath[idx];
             if (seg.groundEmoji && !collectedIndices.has(idx)) {
                 const emojiPos = seg.position.clone().addScaledVector(seg.normal, seg.groundEmoji.offset);
                 if (playerState.position.distanceTo(emojiPos) < 15.0) { 
                     // Collect & Boost Nitro!
                     setCollectedIndices(prev => new Set(prev).add(idx));
                     // Inherit 120% of player velocity to create a "burst forward" effect that keeps up with the car
                     const vel = playerState.velocity.clone().multiplyScalar(1.2);
                     setExplosions(prev => [...prev, { id: Date.now(), pos: emojiPos, type: 'emoji_collect', initialVelocity: vel }]);
                     // Add to buffer instead of direct value for smooth filling
                     if (nitroBufferRef) {
                         nitroBufferRef.current += 45; // Increased boost amount relative to new max
                     }
                 }
             }
         }
    }
  });
  return null;
};

// --- THEME MANAGER (Simplified to be controlled by parent/music) ---
// Now just handles updates if needed or purely relies on props.
// We keep it to watch for prop changes and ensure smooth transitions if necessary,
// but the 'trigger' is now external (Music).
const ThemeManager = ({ 
    activeThemeColors,
}: { 
    activeThemeColors: ThemeColors
}) => {
    // Logic moved to App.tsx to sync with Music. 
    // This component now just exists to satisfy structure if needed, or can be removed.
    // For now, we render nothing and let the props flow down to RaceVisuals/TrackLayer.
    return null;
};

interface GameSceneProps {
    playerCar: CarData;
    onRaceEnd: () => void;
    onRaceUpdate: (data: TelemetryData) => void;
    onTrackInit: (path: SegmentData[]) => void;
    onReady: () => void;
    currentThemeColors: ThemeColors;
    fxParams: SurrealTheme['fx'];
    virtualKeys: { w: boolean, a: boolean, s: boolean, d: boolean, space: boolean, shift: boolean };
    invertScene?: boolean;
    trackSeed: number;
    audioMood: SurrealTheme['audioMood'];
    sun: SurrealTheme['sun'];
    particlesEnabled: boolean;
    isPaused?: boolean;
    language: Language;
    countdown?: number; 
}

const GameScene: React.FC<GameSceneProps> = React.memo(({
    playerCar, onRaceEnd, onRaceUpdate, onTrackInit, onReady,
    currentThemeColors, fxParams, virtualKeys, trackSeed, audioMood, sun, particlesEnabled, isPaused, language, countdown = 0
}) => {
    const [trackPath, setTrackPath] = useState<SegmentData[]>([]);
    const [opponents, setOpponents] = useState<CarData[]>([]);
    const physicsState = useRef(new Map<string, PhysicsState>());
    const playerProgressRef = useRef(0);
    const playerNitroRef = useRef(150); // Init 150
    const playerNitroBufferRef = useRef(0); // Buffer for smooth fill
    const [collectedIndices, setCollectedIndices] = useState<Set<number>>(new Set());
    const [explosions, setExplosions] = useState<{id: number, pos: THREE.Vector3, type: 'wall_hit' | 'emoji_collect', initialVelocity?: THREE.Vector3}[]>([]);

    useEffect(() => {
        const { main } = generateTrackPath(trackSeed);
        setTrackPath(main);
        onTrackInit(main);
        const ops = INITIAL_CARS.filter(c => c.id !== playerCar.id).map(c => ({...c}));
        setOpponents(ops);
        onReady();
    }, [trackSeed, playerCar.id]);

    const registerPhysics = useCallback((id: string, state: PhysicsState) => {
        physicsState.current.set(id, state);
    }, []);
    const getPhysicsStates = useCallback(() => physicsState.current, []);
    const canMove = countdown <= 0;

    return (
        <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 75, position: [0, 5, 10] }}>
            <color attach="background" args={[currentThemeColors.sky]} />
            <fog attach="fog" args={[currentThemeColors.fog, 20, 300]} />
            <ambientLight intensity={0.5} />
            <directionalLight 
                position={sun.position as [number,number,number]} 
                intensity={sun.intensity} 
                color={sun.color} 
                castShadow 
            />
            <EffectComposer>
                <Bloom luminanceThreshold={0.5} intensity={fxParams.bloom} />
                <ChromaticAberration offset={new THREE.Vector2(0.002, 0.002)} />
            </EffectComposer>
            {trackPath.length > 0 && (
                <>
                    <TrackLayer 
                        trackPath={trackPath} 
                        progressRef={playerProgressRef} 
                        neonColor={playerCar.visuals.neon} 
                        isPaused={isPaused} 
                        fogColor={currentThemeColors.fog}
                    />
                    <RaceVisuals 
                        trackPath={trackPath} 
                        currentThemeColors={currentThemeColors} 
                        fxParams={fxParams} 
                        audioMood={audioMood} 
                        playerProgressRef={playerProgressRef}
                        collectedIndices={collectedIndices}
                        isPaused={isPaused}
                        playerCarNeon={playerCar.visuals.neon}
                    />
                    <Car 
                        isPlayer={true} 
                        carData={playerCar} 
                        trackPath={trackPath}
                        registerPhysics={registerPhysics} 
                        getPhysicsStates={getPhysicsStates} 
                        onRaceUpdate={onRaceUpdate} 
                        onRaceEnd={onRaceEnd} 
                        onCollision={() => {
                            const playerState = physicsState.current.get('player');
                            const pos = playerState?.position.clone();
                            if (pos) {
                                // Inherit small amount of velocity so particles don't look completely static
                                // For wall hits, keep most of velocity (100%) so they slide with car
                                const vel = playerState?.velocity.clone().multiplyScalar(1.0);
                                setExplosions(prev => [...prev, { 
                                    id: Date.now(), 
                                    pos: pos.add(new THREE.Vector3((Math.random()-0.5)*2, 1, (Math.random()-0.5)*2)), 
                                    type: 'wall_hit',
                                    initialVelocity: vel
                                }]);
                            }
                        }} 
                        virtualKeys={virtualKeys}
                        playerProgressRef={playerProgressRef}
                        nitroAmountRef={playerNitroRef}
                        nitroBufferRef={playerNitroBufferRef}
                        canMove={canMove}
                        isPaused={isPaused}
                        startOffset={0}
                    />
                    {opponents.map((op, i) => (
                        <Car 
                            key={op.id} 
                            carData={op} 
                            trackPath={trackPath}
                            registerPhysics={registerPhysics} 
                            getPhysicsStates={getPhysicsStates} 
                            onCollision={() => {}}
                            canMove={canMove}
                            isPaused={isPaused}
                            startOffset={(i + 1) * 50} 
                        />
                    ))}
                    <ExplosionManager explosions={explosions} setExplosions={setExplosions} isPaused={isPaused} />
                    {explosions.map(e => (
                        <ParticleBurst key={e.id} position={e.pos} type={e.type} initialVelocity={e.initialVelocity} />
                    ))}
                    <CollisionDetector 
                        physicsState={physicsState}
                        trackPath={trackPath}
                        collectedIndices={collectedIndices}
                        setCollectedIndices={setCollectedIndices}
                        setExplosions={setExplosions}
                        nitroBufferRef={playerNitroBufferRef}
                        isPaused={isPaused}
                    />
                </>
            )}
        </Canvas>
    );
});
export default GameScene;
