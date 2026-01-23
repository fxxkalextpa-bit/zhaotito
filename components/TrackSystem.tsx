
/// <reference lib="dom" />
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SegmentData } from './TrackGenerator';

// --- SHADERS (Unchanged) ---

const RoadShaderMaterial = {
  uniforms: {
    uTime: { value: 0 },
    uDistortion: { value: 0.0 },
    uColor: { value: new THREE.Color('#333333') } 
  },
  side: THREE.DoubleSide, 
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vec4 mvPosition = viewMatrix * worldPosition;
      vViewPosition = -mvPosition.xyz;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform float uDistortion;
    uniform vec3 uColor;
    varying vec2 vUv;
    varying vec3 vViewPosition;
    varying vec3 vNormal;
    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float specularStrength = 0.5;
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5)); 
        vec3 reflectDir = reflect(-lightDir, normal);
        float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
        
        float leftEdge = step(abs(vUv.x - 0.1), 0.02);
        float rightEdge = step(abs(vUv.x - 0.9), 0.02);
        float centerL = step(abs(vUv.x - 0.45), 0.005);
        float centerR = step(abs(vUv.x - 0.55), 0.005);
        float stripes = leftEdge + rightEdge + centerL + centerR;

        vec3 surfaceColor = uColor + vec3(spec * specularStrength);
        vec3 finalColor = mix(surfaceColor, vec3(1.5, 1.5, 1.5), stripes);
        gl_FragColor = vec4(finalColor, 1.0);
    }
  `
};

const WallShaderMaterial = {
  uniforms: { 
      uTime: { value: 0 },
      uFogColor: { value: new THREE.Color('#000000') },
  },
  transparent: true, side: THREE.DoubleSide,
  vertexShader: `
    varying vec2 vUv; 
    varying vec3 vWorldPos; 
    void main() { 
        vUv = uv; 
        vec4 worldPosition = modelMatrix * vec4(position, 1.0); 
        vWorldPos = worldPosition.xyz; 
        gl_Position = projectionMatrix * viewMatrix * worldPosition; 
    }
  `,
  fragmentShader: `
    uniform float uTime; 
    uniform vec3 uFogColor; 
    varying vec3 vWorldPos; 
    varying vec2 vUv; 
    vec3 p(in float t,in vec3 a,in vec3 b,in vec3 c,in vec3 d){
        return a+b*cos(6.28318*(c*t+d));
    }
    mat2 r(float a){
        float s=sin(a),c=cos(a);
        return mat2(c,-s,s,c);
    }
    void main() { 
        vec3 P = vWorldPos * 0.005; 
        float t = uTime * 0.6 + 100.0; 
        P.yz *= r(t * 0.1); P.xz *= r(t * 0.15);
        float g = sin(P.x * 8. + t) * sin(P.z * 8. - t);
        float C = P.y * 4. + g + sin(atan(P.z, P.x) * 6. + t * 2.) * (1. - abs(P.y));
        float N = 0.04 * tan(1.55 * sin(C + 30. * sin(0.02 * C * C)));
        vec3 P2 = P + P * N;
        float s = sin(P2.x * 10.) * sin(P2.y * 10.) * sin(P2.z * 10.) + g * 0.5;
        vec3 patternColor = p(s * 0.4 + N + t * 0.2, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0+t*0.05, 0.33+t*0.05, 0.67+t*0.05));
        float alpha = 0.6 + smoothstep(0.2, 0.8, abs(s)) * 0.4;
        alpha *= smoothstep(0.0, 0.2, vUv.y); 
        vec3 finalColor = patternColor * 2.5;
        float dist = distance(vWorldPos, cameraPosition); 
        float fog = smoothstep(50.0, 400.0, dist); 
        gl_FragColor = vec4(mix(finalColor, uFogColor, fog), alpha * 0.8);
    }
  `
};

// --- HELPER: Collision Physics (Elastic Bounce & Friction Split) ---

export interface CollisionResult {
    didCollide: boolean;
    correctedPosition: THREE.Vector3;
    correctedVelocity: THREE.Vector3;
    side: 'left' | 'right' | 'none'; 
}

export const resolveTrackCollision = (
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    segment: SegmentData,
    carWidth: number = 2.0
): CollisionResult => {
    // 1. Calculate lateral distance from track center
    const vecToCar = position.clone().sub(segment.position);
    const distFromCenter = vecToCar.dot(segment.normal);
    
    // 2. Define Limits
    const trackHalfWidth = segment.width / 2;
    // Check against half-width of car to account for center point
    const limit = trackHalfWidth - (carWidth / 2); 
    
    // If inside bounds, everything is valid.
    if (Math.abs(distFromCenter) <= limit) {
        return { 
            didCollide: false, 
            correctedPosition: position, 
            correctedVelocity: velocity,
            side: 'none'
        };
    }

    // --- 3. VIOLATION DETECTED ---
    const sign = Math.sign(distFromCenter); // 1 = Right Wall, -1 = Left Wall
    
    // A. POSITION CONSTRAINT
    // Use a very small safety buffer (0.05) just to get out of the wall, preventing Z-fighting.
    // Large buffers cause "teleporting" visual glitches.
    const safetyBuffer = 0.05;
    const currentDist = distFromCenter;
    const overlap = Math.abs(currentDist) - limit;
    
    // Calculate vector to push car back onto track
    const correctionMagnitude = (overlap + safetyBuffer) * sign;
    const correction = segment.normal.clone().multiplyScalar(correctionMagnitude);
    const newPos = position.clone().sub(correction);
    
    // B. VELOCITY RESOLUTION (Absorb & Slide)
    // Wall Normal points IN towards the track center
    const wallNormal = segment.normal.clone().multiplyScalar(-sign);
    
    // Decompose velocity: v = v_normal + v_tangent
    const vDotN = velocity.dot(wallNormal);
    
    let newVel = velocity.clone();
    
    // Only resolve if moving INTO the wall
    if (vDotN < 0) {
        // 1. Separate components
        const vNormal = wallNormal.clone().multiplyScalar(vDotN);
        const vTangent = velocity.clone().sub(vNormal);
        
        // 2. Dynamic Restitution (Bounce)
        // If hitting wall head-on (large vDotN), restitution approaches 0 (absorb shock).
        // If grazing wall (small vDotN), keep slight restitution (0.2).
        const restitution = 0.1; 
        
        // Limit the bounce speed. High bounce causes 180 flips.
        const maxBounceSpeed = 0.5;
        const bounceSpeed = Math.min(-vDotN * restitution, maxBounceSpeed);
        
        const responseNormal = wallNormal.clone().multiplyScalar(bounceSpeed);
        
        // 3. Tangent Friction (Slide)
        // Keep most of the forward momentum (0.90) to allow grinding
        const wallFriction = 0.90;
        const responseTangent = vTangent.multiplyScalar(wallFriction);
        
        // 4. Recombine
        newVel.copy(responseNormal).add(responseTangent);

        // --- 5. ANTI-REVERSE GUARD ---
        // If the new velocity vector points backwards relative to the original motion,
        // it means we bounced too hard or at a bad angle, causing a spin.
        // Force the velocity to be purely tangent (slide only).
        if (newVel.dot(velocity) < 0) {
             newVel.copy(responseTangent);
        }
    }

    return {
        didCollide: true,
        correctedPosition: newPos,
        correctedVelocity: newVel,
        side: sign > 0 ? 'right' : 'left'
    };
};

// --- VISUAL COMPONENTS (Unchanged) ---

const dampColor = (current: THREE.Color, target: string, step: number) => {
    const t = new THREE.Color(target);
    current.lerp(t, step);
};

export const TrackVisuals = React.memo(({ path, progressRef, neonColor, isPaused }: { path: SegmentData[], progressRef?: React.MutableRefObject<number>, neonColor: string, isPaused?: boolean }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    
    const targetTrackColor = useMemo(() => {
        const c = new THREE.Color(neonColor === 'none' ? '#ffffff' : (neonColor === 'cyan' ? '#00ffff' : neonColor === 'blue' ? '#0000ff' : neonColor === 'red' ? '#ff0000' : neonColor === 'green' ? '#00ff00' : '#aa00ff'));
        const inverted = new THREE.Color(1.0 - c.r, 1.0 - c.g, 1.0 - c.b);
        const hsl = { h:0, s:0, l:0 };
        inverted.getHSL(hsl);
        inverted.setHSL(hsl.h, hsl.s * 0.6, Math.max(0.15, hsl.l)); 
        return inverted.getHexString();
    }, [neonColor]);

    useFrame((state) => {
        if (isPaused) return;
        if (matRef.current) {
            matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            if (progressRef) {
                matRef.current.uniforms.uDistortion.value = Math.max(0, 1.0 - progressRef.current);
            }
            dampColor(matRef.current.uniforms.uColor.value, '#' + targetTrackColor, 0.05);
        }
    });

    const geo = useMemo(() => {
        const count = path.length;
        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        for (let i = 0; i < count; i++) {
            const curr = path[i];
            const halfWidth = curr.width / 2;
            const left = curr.position.clone().addScaledVector(curr.normal, -halfWidth);
            const right = curr.position.clone().addScaledVector(curr.normal, halfWidth);
            vertices.push(left.x, left.y, left.z);
            vertices.push(right.x, right.y, right.z);
            uvs.push(0, i); uvs.push(1, i);
        }

        for (let i = 0; i < count - 1; i++) {
            const l1 = i * 2, r1 = i * 2 + 1, l2 = (i + 1) * 2, r2 = (i + 1) * 2 + 1;
            indices.push(l1, l2, r1); indices.push(r1, l2, r2);
        }
        const lastIdx = (count - 1) * 2;
        indices.push(lastIdx, 0, lastIdx + 1); indices.push(lastIdx + 1, 0, 1);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 100000);
        return geometry;
    }, [path]);

    return (<mesh geometry={geo} receiveShadow castShadow frustumCulled={false}><shaderMaterial ref={matRef} args={[RoadShaderMaterial]} /></mesh>);
});

export const WallVisuals = React.memo(({ path, isPaused, fogColor }: { path: SegmentData[], isPaused?: boolean, fogColor: string }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    useFrame((state, delta) => {
        if (isPaused) return;
        if (matRef.current) {
            matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            dampColor(matRef.current.uniforms.uFogColor.value, fogColor, delta * 2.0);
        }
    });

    const geo = useMemo(() => {
        const count = path.length;
        const height = 2.5; // Taller walls
        const positions: number[] = [];
        const uvs: number[] = [];
        
        for(let i=0; i<count; i++) {
            const s1 = path[i];
            const s2 = path[(i+1) % count];
            const w1 = (s1.width/2) + 2;
            const w2 = (s2.width/2) + 2;

            const l1 = s1.position.clone().addScaledVector(s1.normal, -w1);
            const l2 = s2.position.clone().addScaledVector(s2.normal, -w2);
            const r1 = s1.position.clone().addScaledVector(s1.normal, w1);
            const r2 = s2.position.clone().addScaledVector(s2.normal, w2);

            const l1t = l1.clone().add(new THREE.Vector3(0, height, 0));
            const l2t = l2.clone().add(new THREE.Vector3(0, height, 0));
            const r1t = r1.clone().add(new THREE.Vector3(0, height, 0));
            const r2t = r2.clone().add(new THREE.Vector3(0, height, 0));

            // Left
            positions.push(l1.x, l1.y, l1.z, l2.x, l2.y, l2.z, l2t.x, l2t.y, l2t.z);
            uvs.push(0,0, 1,0, 1,1);
            positions.push(l1.x, l1.y, l1.z, l2t.x, l2t.y, l2t.z, l1t.x, l1t.y, l1t.z);
            uvs.push(0,0, 1,1, 0,1);

            // Right
            positions.push(r1.x, r1.y, r1.z, r1t.x, r1t.y, r1t.z, r2t.x, r2t.y, r2t.z);
            uvs.push(0,0, 0,1, 1,1);
            positions.push(r1.x, r1.y, r1.z, r2t.x, r2t.y, r2t.z, r2.x, r2.y, r2.z);
            uvs.push(0,0, 1,1, 1,0);
        }

        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.computeVertexNormals();
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 100000);
        return g;
    }, [path]);

    return (<mesh geometry={geo} frustumCulled={false}><shaderMaterial ref={matRef} args={[WallShaderMaterial]} transparent side={THREE.DoubleSide} /></mesh>);
});

export const TrackLayer = ({ trackPath, progressRef, neonColor, isPaused, fogColor }: any) => {
    return (
        <group>
            <TrackVisuals path={trackPath} progressRef={progressRef} neonColor={neonColor} isPaused={isPaused} />
            <WallVisuals path={trackPath} isPaused={isPaused} fogColor={fogColor} />
        </group>
    )
}
