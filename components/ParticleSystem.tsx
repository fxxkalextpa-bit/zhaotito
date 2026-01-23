
/// <reference lib="dom" />
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// --- Shaders ---
const SolidRainbowFragment = `
    uniform float uTime;
    varying float vRandom;
    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    void main() {
        float speed = 0.2 + vRandom * 0.6;
        float hue = fract(uTime * speed + vRandom * 10.0); 
        vec3 color = hsv2rgb(vec3(hue, 1.0, 1.0));
        gl_FragColor = vec4(color, 1.0);
    }
`;

// Updated Smoke Fragment: No longer circular, now a fading square
const SolidRainbowSmokeFragment = `
    uniform float uTime;
    varying vec2 vUv;
    varying float vRandom;
    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
    void main() {
        float speed = 0.3 + vRandom * 0.5;
        float hue = fract(uTime * speed + vRandom * 5.0); 
        vec3 color = hsv2rgb(vec3(hue, 1.0, 1.0));
        
        // Square fade logic based on UV distance from center (Box distance)
        vec2 d = abs(vUv - 0.5) * 2.0; 
        float dist = max(d.x, d.y); // Chebychev distance for square shape
        
        // Harder edge square with inner fade
        float alpha = 1.0 * (1.0 - smoothstep(0.6, 1.0, dist));
        
        if(alpha < 0.05) discard;
        gl_FragColor = vec4(color, alpha * 0.9); 
    }
`;

const CommonVertexShader = `
    attribute float aRandom;
    varying vec2 vUv;
    varying float vRandom;
    void main() {
        vUv = uv;
        vRandom = aRandom;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); 
    }
`;

// Materials
export const SolidParticleMaterial = {
    uniforms: { uTime: { value: 0 } },
    vertexShader: CommonVertexShader,
    fragmentShader: SolidRainbowFragment,
    side: THREE.DoubleSide
};

export const PsychedelicSmokeMaterial = {
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false, 
    side: THREE.DoubleSide, 
    vertexShader: CommonVertexShader,
    fragmentShader: SolidRainbowSmokeFragment
};

// --- Updated Particle System ---

interface ParticleBurstProps {
    position: THREE.Vector3;
    type: 'wall_hit' | 'emoji_collect' | 'damage_smoke'; 
    initialVelocity?: THREE.Vector3;
}

export const ParticleBurst: React.FC<ParticleBurstProps> = ({ position, type, initialVelocity }) => {
    const mesh = useRef<THREE.InstancedMesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    
    // Check mode
    const isSmoke = type === 'damage_smoke';

    // Config
    const particleCount = useMemo(() => {
        if (isSmoke) return 20; 
        return type === 'wall_hit' ? 25 : 50;
    }, [type, isSmoke]);
    
    // Init Data
    const particles = useMemo(() => Array.from({length: particleCount}, () => {
        const speed = isSmoke ? 5 : (type === 'wall_hit' ? 40 : 30);
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = new THREE.Vector3(
            Math.cos(angle) * (Math.random() * speed),
            isSmoke ? (Math.random() * 5) : (Math.random() * speed * 0.8), 
            Math.sin(angle) * (Math.random() * speed)
        );

        if (initialVelocity) {
            velocity.add(initialVelocity.clone().multiplyScalar(isSmoke ? 0.5 : 1.0));
        }

        return {
            vel: velocity,
            pos: new THREE.Vector3(
                (Math.random() - 0.5) * (isSmoke ? 2 : 0), 
                (Math.random() - 0.5) * (isSmoke ? 1 : 0), 
                (Math.random() - 0.5) * (isSmoke ? 2 : 0)
            ),
            life: 1.0,
            scale: isSmoke ? (Math.random() * 2.0 + 1.0) : (type === 'wall_hit' ? Math.random() * 1.5 + 0.5 : Math.random() * 2.0 + 0.5), 
            random: Math.random() 
        };
    }), [type, particleCount, initialVelocity, isSmoke]);

    const dummy = useMemo(() => new THREE.Object3D(), []);
    const randomAttribute = useMemo(() => new Float32Array(particles.map(p => p.random)), [particles]);

    useFrame((state, delta) => {
        if (!mesh.current) return;
        if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;

        particles.forEach((p, i) => {
            if (p.life > 0) {
                // --- Physics ---
                if (isSmoke) {
                    p.life -= delta * 0.8; 
                    p.vel.y += delta * 10.0; // Buoyancy
                    p.vel.x *= 0.95; // Drag
                    p.vel.z *= 0.95; 
                    p.scale += delta * 2.0; // Expansion
                } else {
                    p.life -= delta * 1.5; 
                    p.vel.y -= delta * 40.0; // Gravity
                }

                p.pos.addScaledVector(p.vel, delta);
                
                // --- Matrix Update ---
                dummy.position.copy(position).add(p.pos);
                
                const s = p.scale * p.life; 
                dummy.scale.set(s, s, s); 
                
                if (isSmoke) {
                    // Billboarding: Always face camera
                    dummy.lookAt(state.camera.position);
                } else {
                    // Tumble the flat squares
                    dummy.rotation.x += delta * (10 + p.random * 10);
                    dummy.rotation.y += delta * (10 + p.random * 10);
                    dummy.rotation.z += delta * (10 + p.random * 10);
                }
                
                dummy.updateMatrix();
                mesh.current!.setMatrixAt(i, dummy.matrix);
            } else {
                dummy.scale.set(0,0,0);
                dummy.updateMatrix();
                mesh.current!.setMatrixAt(i, dummy.matrix);
            }
        });
        mesh.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, particleCount]}>
            {/* FORCE PLANE GEOMETRY FOR EVERYTHING - "Flat Squares" */}
            <planeGeometry args={[1, 1]}>
                <instancedBufferAttribute attach="attributes-aRandom" args={[randomAttribute, 1]} />
            </planeGeometry>

            {/* Switch Material */}
            <shaderMaterial 
                ref={materialRef} 
                args={[isSmoke ? PsychedelicSmokeMaterial : SolidParticleMaterial]} 
                toneMapped={false} 
                transparent={isSmoke} 
                side={THREE.DoubleSide}
            />
        </instancedMesh>
    );
};

export const ExplosionManager = ({ explosions, setExplosions, isPaused }: { explosions: {id: number}[], setExplosions: any, isPaused?: boolean }) => {
    useFrame(() => {
        if (isPaused) return;
        const now = Date.now();
        if (explosions.some(e => now - e.id > 1000)) {
            setExplosions((prev: any[]) => prev.filter(e => now - e.id <= 1000));
        }
    });
    return null;
}
