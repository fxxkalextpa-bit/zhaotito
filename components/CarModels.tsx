
/// <reference lib="dom" />
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Trail, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { CarClass, VisualMods } from '../types';

// --- COMPONENT PARTS ---

// Functional Headlights (Light Sources Only)
const Headlights = () => (
    <group>
        <spotLight position={[0.6, 0.5, -1.5]} target-position={[0.6, 0, -10]} angle={0.6} penumbra={0.5} intensity={8} color="#ccffff" distance={40} castShadow />
        <spotLight position={[-0.6, 0.5, -1.5]} target-position={[-0.6, 0, -10]} angle={0.6} penumbra={0.5} intensity={8} color="#ccffff" distance={40} castShadow />
    </group>
);

// Functional Taillights (Light Sources Only)
const Taillights = ({ breaking }: { breaking: boolean }) => {
    const intensity = breaking ? 5.0 : 1.0;
    return (
        <group>
            <pointLight position={[0, 0.5, 1.8]} intensity={intensity} color="#ff0000" distance={6} decay={2} />
        </group>
    );
};

// --- GLB LOADER COMPONENT ---

interface GlbCarBodyProps {
    url: string;
    color: string;
    rotation?: [number, number, number];
    scale?: number;
    position?: [number, number, number];
}

const GlbCarBody = React.memo(({ url, color, rotation = [0, -Math.PI/2, 0], scale = 1.0, position = [0, 0.6, 0] }: GlbCarBodyProps) => {
    const { scene } = useGLTF(url);
    
    // Performance: Clone scene only once per URL change to allow independent materials
    const clone = useMemo(() => scene.clone(), [scene]);

    // Cache references to materials to avoid traversing scene graph in useFrame
    const bodyMaterials = useRef<THREE.MeshStandardMaterial[]>([]);
    const glowMaterials = useRef<THREE.MeshStandardMaterial[]>([]);

    // Initial Setup: Identify parts, Clone Materials, Set Base Properties
    // Using useEffect to minimize render blocking
    useEffect(() => {
        // Reset caches
        bodyMaterials.current = [];
        glowMaterials.current = [];
        
        let maxVolume = 0;
        let bodyMeshCandidate: THREE.Mesh | null = null;

        // Traverse once to setup
        clone.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                // Handle Material Cloning & Identification
                if (Array.isArray(mesh.material)) {
                    mesh.material = mesh.material.map(m => m.clone());
                } else {
                    mesh.material = mesh.material.clone();
                }

                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

                materials.forEach(mat => {
                    if (mat.name === "Glow_Psychedelic") {
                        glowMaterials.current.push(mat as THREE.MeshStandardMaterial);
                    }
                    else if (mat.name === "Body_Chrome") {
                        bodyMaterials.current.push(mat as THREE.MeshStandardMaterial);
                        const standardMat = mat as THREE.MeshStandardMaterial;
                        standardMat.metalness = 0.6;
                        standardMat.roughness = 0.2;
                        standardMat.envMapIntensity = 1.0;
                    }
                });

                // Heuristic for fallback body identification
                if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
                const box = mesh.geometry.boundingBox!;
                const size = new THREE.Vector3();
                box.getSize(size);
                const volume = size.x * size.y * size.z;

                if (volume > maxVolume) {
                    maxVolume = volume;
                    bodyMeshCandidate = mesh;
                }
            }
        });

        // Apply Heuristic Body Paint if no explicit Body_Chrome found
        if (bodyMaterials.current.length === 0 && bodyMeshCandidate) {
             const mesh = bodyMeshCandidate as THREE.Mesh;
             const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
             materials.forEach(mat => {
                 mat.name = 'Body_Chrome';
                 const standardMat = mat as THREE.MeshStandardMaterial;
                 standardMat.metalness = 0.6; 
                 standardMat.roughness = 0.2;
                 standardMat.envMapIntensity = 1.0;
                 bodyMaterials.current.push(standardMat);
             });
        }
    }, [clone]);

    // Optimized Frame Loop
    useFrame((state) => {
        const time = state.clock.elapsedTime;
        
        // 1. Update Body Color
        bodyMaterials.current.forEach(mat => {
             // Only update if color actually changed (optimization handled by React props usually, but good safety)
             mat.color.set(color);
        });

        // 2. Update Glow Effects
        if (glowMaterials.current.length > 0) {
            const hue = (time * 0.2) % 1;
            const intensity = 2 + Math.sin(time * 4) * 1.5;
            glowMaterials.current.forEach(mat => {
                if ('emissive' in mat) {
                    mat.emissive.setHSL(hue, 0.8, 0.5);
                    mat.emissiveIntensity = intensity;
                }
            });
        }
    });

    return <primitive object={clone} rotation={rotation} scale={scale} position={position} />;
});

// Preload models for speed
useGLTF.preload('/models/starter_01.glb');
useGLTF.preload('/models/muscle_02.glb');
useGLTF.preload('/models/tuner_03.glb');
useGLTF.preload('/models/tank_04.glb');
useGLTF.preload('/models/hyper_05.glb');
useGLTF.preload('/models/ultimate_06.glb');

// --- MAIN CAR COMPONENT ---

export interface CarModelProps {
    color: string;
    carClass: CarClass;
    isOverEmoji?: boolean;
    damageRef?: React.MutableRefObject<number>;
    visuals?: VisualMods;
    driftRef?: React.MutableRefObject<boolean>;
    isGarage?: boolean;
    steeringRef?: React.MutableRefObject<number>; 
}

export const CarModel = React.memo(({ color, carClass, isOverEmoji = false, damageRef, visuals, driftRef, isGarage = false, steeringRef }: CarModelProps) => {
    const groupRef = useRef<THREE.Group>(null);
    const chassisRef = useRef<THREE.Group>(null);

    // Fallbacks
    const fallbackSteering = useRef(0);
    const steering = steeringRef || fallbackSteering;

    // Visual Physics State
    const visualTilt = useRef({ x: 0, z: 0 });

    useFrame((state, delta) => {
        if (!groupRef.current) return;

        // --- Sophisticated Suspension / Tilt Physics ---
        if (!isGarage) {
            const steerVal = steering.current;
            const tiltSpeed = 5.0 * delta;
            
            // Roll (Body lean into turn)
            const targetRoll = -steerVal * 0.15; 
            visualTilt.current.z += (targetRoll - visualTilt.current.z) * tiltSpeed;
            
            // Pitch 
            const targetPitch = 0.02; 
            visualTilt.current.x += (targetPitch - visualTilt.current.x) * tiltSpeed;

            // Apply to Chassis only
            if (chassisRef.current) {
                chassisRef.current.rotation.z = visualTilt.current.z;
                chassisRef.current.rotation.x = visualTilt.current.x;
                // Vertical float (Maglev feeling)
                chassisRef.current.position.y = Math.sin(state.clock.elapsedTime * 3) * 0.01; 
            }
        }
    });

    const neonColorHex = visuals?.neon === 'cyan' ? '#00ffff' : visuals?.neon === 'red' ? '#ff0000' : visuals?.neon === 'green' ? '#00ff00' : visuals?.neon === 'blue' ? '#0000ff' : visuals?.neon === 'purple' ? '#aa00ff' : '#ffffff';
    
    // Resolve GLB URL based on class
    const getGlbUrl = () => {
        switch (carClass) {
            case CarClass.D: return "/models/starter_01.glb";
            case CarClass.C: return "/models/muscle_02.glb";
            case CarClass.B: return "/models/tuner_03.glb";
            case CarClass.A: return "/models/tank_04.glb";
            case CarClass.S: 
                return color.includes('#202020') ? "/models/ultimate_06.glb" : "/models/hyper_05.glb";
            default: return "/models/starter_01.glb";
        }
    };

    // UPDATED TRAIL SETTINGS: Longer, slightly wider, linear attenuation for gradient strip look
    const trailWidth = 0.8;
    const trailLength = 20; 

    return (
        <group ref={groupRef}>
             {/* Dynamic Chassis Group */}
             <group ref={chassisRef}>
                 {/* RAISED MODEL POSITION (0.6) to avoid ground clipping */}
                 <GlbCarBody url={getGlbUrl()} color={color} position={[0, 0.6, 0]} />
                 
                 {/* Functional Lights (Mesh hidden, just Light Source) */}
                 {!isGarage && (
                     <>
                        <group position={[0, 0.6, 0]}><Headlights /></group>
                        <group position={[0, 0.6, 0]} rotation={[0, Math.PI, 0]}><Taillights breaking={false}/></group>
                     </>
                 )}
                 
                 {/* Light Trails - Attached to Chassis so they follow tilt */}
                 {!isGarage && (
                     <group position={[0, 0.6, 1.8]}>
                        <Trail width={trailWidth} length={trailLength} color={neonColorHex} attenuation={(t) => t}>
                             <mesh visible={false} />
                        </Trail>
                        {/* Center Trail for extra speed feel */}
                        <Trail width={trailWidth * 0.4} length={trailLength * 1.2} color="white" attenuation={(t) => t * t}>
                             <mesh visible={false} position={[0, 0.2, 0]} />
                        </Trail>
                     </group>
                 )}

                 {/* Neon Underglow Mesh */}
                 {visuals?.neon !== 'none' && (
                     <mesh position={[0, 0.2, 0]} rotation={[-Math.PI/2, 0, 0]}>
                         <planeGeometry args={[1.5, 3.5]} />
                         <meshBasicMaterial color={neonColorHex} transparent opacity={0.3} toneMapped={false} side={THREE.DoubleSide} />
                     </mesh>
                 )}
             </group>
             
             {/* Exhaust Smoke (Only if not garage) */}
             {!isGarage && (
                 <group position={[0, 0.3, 2.5]}>
                      {/* Placeholder for particle system anchor */}
                 </group>
             )}
        </group>
    );
});
