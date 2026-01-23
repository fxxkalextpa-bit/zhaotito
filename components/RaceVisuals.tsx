
/// <reference lib="dom" />
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Text, Environment } from '@react-three/drei';
import { Effect } from 'postprocessing';
import * as THREE from 'three';
import { SurrealTheme } from '../types';
import { SegmentData } from './TrackGenerator';
import { EMOJI_POOL } from '../constants';

// --- Types & Globals ---
export type ThemeColors = SurrealTheme['colors'];

// --- Math Utils ---
const dampColor = (current: THREE.Color, target: string, step: number) => {
  const t = new THREE.Color(target);
  current.lerp(t, step);
};

// --- SHADERS ---

const SolidRainbowFragment = `
    uniform float uTime;
    uniform float uRandom; 
    
    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
        // High saturation color cycle, slow speed
        float speed = 0.2 + uRandom * 0.6;
        float hue = fract(uTime * speed + uRandom * 10.0); 
        vec3 color = hsv2rgb(vec3(hue, 1.0, 1.0));
        gl_FragColor = vec4(color, 1.0);
    }
`;

const PsychedelicObjectMaterial = {
    uniforms: { 
        uTime: { value: 0 },
        uRandom: { value: 0 } 
    },
    vertexShader: `
        varying vec2 vUv; 
        void main() { 
            vUv = uv; 
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); 
        }
    `,
    fragmentShader: SolidRainbowFragment
};

const SkyShaderMaterial = {
  uniforms: { 
    colorTop: { value: new THREE.Color('#000000') }, 
    colorBottom: { value: new THREE.Color('#000000') }, 
    time: { value: 0 }
  },
  vertexShader: `varying vec3 vWorldPosition; void main() { vWorldPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform vec3 colorTop; 
    uniform vec3 colorBottom; 
    uniform float time; 
    varying vec3 vWorldPosition; 

    vec3 p(in float t,in vec3 a,in vec3 b,in vec3 c,in vec3 d){
        return a+b*cos(6.28318*(c*t+d));
    }
    mat2 r(float a){
        float s=sin(a),c=cos(a);
        return mat2(c,-s,s,c);
    }
    void main(){
        vec3 P=normalize(vWorldPosition);
        float t=time*0.5;
        P.yz*=r(t*0.1);
        P.xz*=r(t*0.15);
        float g=sin(P.x*8.+t)*sin(P.z*8.-t);
        float C=P.y*4.+g+sin(atan(P.z,P.x)*6.+t*2.)*(1.-abs(P.y));
        // Use smooth sine wave based on time instead of progress to prevent jump
        float factor = 1.3 + 0.2 * sin(time * 0.5);
        float N=0.04*tan(factor*sin(C+30.*sin(0.02*C*C)));
        vec3 P2=P+P*N;
        float s=sin(P2.x*10.)*sin(P2.y*10.)*sin(P2.z*10.)+g*0.5;
        vec3 R=p(s*0.4+N+t*0.2,vec3(0.5),vec3(0.5),vec3(1.),vec3(0.263,0.416,0.557));
        vec3 B=mix(colorBottom,colorTop,0.5+0.5*P.y);
        gl_FragColor=vec4(mix(B,R,smoothstep(0.,1.,abs(s)+abs(N)*3.)),1.);
    }
  `
};

class InvertEffectImpl extends Effect {
  constructor() { super('InvertEffect', `uniform float uEnabled; void mainImage(const in vec4 i, const in vec2 uv, out vec4 o) { o = vec4(mix(i.rgb, 1.0 - i.rgb, uEnabled), i.a); }`, { uniforms: new Map([['uEnabled', new THREE.Uniform(0.0)]]) }); }
}
export const InvertEffect = ({ enabled }: { enabled: boolean }) => {
    const effect = useMemo(() => new InvertEffectImpl(), []);
    useFrame(() => { ((effect as any).uniforms.get('uEnabled') as THREE.Uniform).value = enabled ? 1.0 : 0.0; });
    return <primitive object={effect} dispose={null} />;
};

// --- VISUAL COMPONENTS ---

const DynamicSky = ({ topColor, bottomColor, progressRef, isPaused }: { topColor: string, bottomColor: string, progressRef?: React.MutableRefObject<number>, isPaused?: boolean }) => {
    const meshRef = useRef<THREE.Mesh>(null), matRef = useRef<THREE.ShaderMaterial>(null);
    useFrame((state) => {
        if (isPaused) return;
        if (matRef.current) { 
            matRef.current.uniforms.time.value = state.clock.elapsedTime; 
            dampColor(matRef.current.uniforms.colorTop.value, topColor, 0.1); 
            dampColor(matRef.current.uniforms.colorBottom.value, bottomColor, 0.1); 
        }
        if (meshRef.current) meshRef.current.position.copy(state.camera.position);
    });
    return (<mesh ref={meshRef} scale={500}><sphereGeometry args={[1, 64, 64]}/><shaderMaterial ref={matRef} args={[SkyShaderMaterial]} side={THREE.BackSide} depthWrite={false}/></mesh>);
};

// --- REFLECTIVE ENVIRONMENT FOR CAR ---
export const ReflectiveEnvironment = ({ topColor, bottomColor }: { topColor: string, bottomColor: string }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    
    useFrame((state) => {
        if (matRef.current) {
             matRef.current.uniforms.time.value = state.clock.elapsedTime;
             dampColor(matRef.current.uniforms.colorTop.value, topColor, 0.1);
             dampColor(matRef.current.uniforms.colorBottom.value, bottomColor, 0.1);
        }
    });

    return (
        <Environment frames={1} resolution={256} background={false}>
            <mesh scale={100}>
                <sphereGeometry args={[1, 64, 64]} />
                <shaderMaterial ref={matRef} args={[SkyShaderMaterial]} side={THREE.BackSide} />
            </mesh>
        </Environment>
    );
};

const AnimatedEmoji: React.FC<{ pos:THREE.Vector3, char:string, size:number, baseScale:[number,number,number], rotation?:[number,number,number], isGround?:boolean, isPaused?: boolean }> = ({ pos, char, size, baseScale, rotation, isGround, isPaused }) => {
    const textRef = useRef<any>(null), offset = useRef(Math.random()*100);
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const randomSeed = useRef(Math.random());

    const randomRot = useRef({
        x: Math.random() * 2,
        y: Math.random() * 2,
        z: Math.random() * 2,
        speed: (Math.random() - 0.5) * 4
    });

    useFrame((state) => {
        if (isPaused) return;
        const t = state.clock.elapsedTime + offset.current;
        if (matRef.current) {
            matRef.current.uniforms.uTime.value = state.clock.elapsedTime;
            matRef.current.uniforms.uRandom.value = randomSeed.current;
        }
        
        if (textRef.current) {
            const s = isGround ? 1.0 : 0.2, sx=1+Math.sin(t*8*s)*0.3, sy=1+Math.cos(t*7.5*s)*0.3;
            textRef.current.scale.set(baseScale[0]*sx, baseScale[1]*sy, 1);
            
            if (isGround) {
                textRef.current.rotation.z = (rotation ? rotation[2] : 0) + Math.sin(t * 2.0) * 0.3;
                textRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 3.0) * 0.2; 
            } else {
                textRef.current.rotation.x = t * randomRot.current.speed * 0.5;
                textRef.current.rotation.y = t * randomRot.current.speed * 0.8;
                textRef.current.rotation.z = t * randomRot.current.speed;
            }
        }
    });

    return isGround ? (
        <group position={pos} rotation={rotation ? [rotation[0], rotation[1], 0] : [0,0,0]}>
            <Text ref={textRef} fontSize={size} scale={baseScale} anchorX="center" anchorY="middle">
                {char}
                <shaderMaterial ref={matRef} args={[PsychedelicObjectMaterial]} />
            </Text>
        </group>
    ) : (
        <Float speed={2} rotationIntensity={1} floatIntensity={1}>
            <Text ref={textRef} position={pos} fontSize={size} scale={baseScale} anchorX="center" anchorY="middle">
                {char}
                <shaderMaterial ref={matRef} args={[PsychedelicObjectMaterial]} />
            </Text>
        </Float>
    );
}

const FloatingMysteryEmojis = React.memo(({ trackPath, collectedIndices, isPaused }: { trackPath: SegmentData[], collectedIndices?: Set<number>, isPaused?: boolean }) => {
    const emojis = useMemo(() => Array.from({length: trackPath.length / 5}).map((_, i) => { 
        const seg = trackPath[i*5]; if (Math.random() > 0.4) return null;
        const pos = seg.position.clone().add(seg.normal.clone().multiplyScalar((Math.random()>0.5?1:-1)*(60+Math.random()*80))); 
        pos.y += 20 + Math.random()*80;
        const char = EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)];
        return { pos, char, size: 10+Math.random()*40, scale: [1,1,1] as [number,number,number] };
    }).filter(Boolean), [trackPath]);
    return <group>{emojis.map((e,i) => e && <AnimatedEmoji key={i} pos={e.pos} char={e.char} size={e.size} baseScale={e.scale} isPaused={isPaused}/>)}</group>;
});

const GroundDecals = React.memo(({ trackPath, collectedIndices, isPaused }: { trackPath: SegmentData[], collectedIndices?: Set<number>, isPaused?: boolean }) => {
    const decals = useMemo(() => trackPath.map(seg => {
        if (!seg.groundEmoji) return null;
        const { char, offset, size, rotation: zRot } = seg.groundEmoji;
        const pos = seg.position.clone().add(seg.normal.clone().multiplyScalar(offset)); 
        pos.y += 0.05; 
        const rot = seg.rotation.clone(); rot.x -= Math.PI / 2; rot.z += zRot; 
        return { pos, char, size, scale: [1,1,1], rotation: [rot.x,rot.y,rot.z], index: seg.index };
    }).filter(Boolean), [trackPath]);

    return (
        <group>
            {decals.map((e,i)=> {
                 if (e && collectedIndices && collectedIndices.has(e.index)) return null;
                 return e && <AnimatedEmoji key={`g-${i}`} pos={e.pos} char={e.char} size={e.size} baseScale={e.scale as [number,number,number]} rotation={e.rotation as [number,number,number]} isGround={true} isPaused={isPaused}/>
            })}
        </group>
    )
});

const DistortedElementWithProgress = ({ p, s, d, o, progressRef, isPaused }: { p:[number,number,number], s:number, d:number, o:number, progressRef?: React.MutableRefObject<number>, isPaused?: boolean }) => {
    const matRef = useRef<THREE.ShaderMaterial>(null);
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (isPaused) return;
        const time = state.clock.elapsedTime;
        if(matRef.current) {
            matRef.current.uniforms.uTime.value = time;
            matRef.current.uniforms.uDistortScale.value = d * 2.0;
        }
        if (meshRef.current) {
            meshRef.current.rotation.x = time * s * 0.1;
            meshRef.current.rotation.y = time * s * 0.15;
        }
    });

    return (
        <Float speed={s*0.5} rotationIntensity={0} floatIntensity={2}>
            <mesh ref={meshRef} position={p}>
                <icosahedronGeometry args={[1,16]} /> 
                <shaderMaterial ref={matRef} args={[DistortedPsychedelicMaterial]} transparent opacity={0.8} />
            </mesh>
        </Float>
    );
}

const DistortedBackground = ({ distort, speed, progressRef, isPaused }: { distort: number, speed: number, progressRef?: React.MutableRefObject<number>, isPaused?: boolean }) => {
    const elements = useMemo(() => Array.from({length:3}).map((_, i) => ({ id:i, p:[(Math.random()-0.5)*10,(Math.random()-0.5)*5,(Math.random()-0.5)*10-5] as [number,number,number], s:speed*(0.5+Math.random()), d:distort*(0.5+Math.random()), o:Math.random()*100 })), [distort, speed]);
    return <group scale={20}>{elements.map(el => <DistortedElementWithProgress key={el.id} {...el} progressRef={progressRef} isPaused={isPaused} />)}</group>;
};

const DistortedPsychedelicMaterial = {
    uniforms: { 
        uTime: { value: 0 },
        uDistortScale: { value: 1.0 } 
    },
    vertexShader: `
        varying vec2 vUv; 
        varying vec3 vWorldPos; 
        uniform float uTime;
        uniform float uDistortScale;

        void main() { 
            vUv = uv; 
            vec3 p = position;
            float noise = sin(p.x * 2.0 + uTime) * cos(p.y * 3.0 + uTime) * sin(p.z * 4.0 + uTime);
            p += normal * noise * uDistortScale;
            vec4 worldPosition = modelMatrix * vec4(p, 1.0); 
            vWorldPos = worldPosition.xyz; 
            gl_Position = projectionMatrix * viewMatrix * worldPosition; 
        }
    `,
    fragmentShader: `
        uniform float uTime; 
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
            vec3 P = vWorldPos * 0.002; 
            float t = uTime * 4.0; 

            P.yz *= r(t * 0.1);
            P.xz *= r(t * 0.15);

            float g = sin(P.x * 8. + t) * sin(P.z * 8. - t);
            float C = P.y * 4. + g + sin(atan(P.z, P.x) * 6. + t * 2.) * (1. - abs(P.y));
            float N = 0.04 * tan(1.5 * sin(C + 30. * sin(0.02 * C * C)));
            vec3 P2 = P + P * N;
            float s = sin(P2.x * 10.) * sin(P2.y * 10.) * sin(P2.z * 10.) + g * 0.5;

            vec3 col = p(s * 0.4 + N + t * 0.2, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
            gl_FragColor = vec4(col, 1.0);
        }
    `
};

export const RaceVisuals = ({ trackPath, currentThemeColors, fxParams, audioMood, playerProgressRef, collectedIndices, isPaused, playerCarNeon }: {
    trackPath: SegmentData[],
    currentThemeColors: ThemeColors,
    fxParams: SurrealTheme['fx'],
    audioMood: SurrealTheme['audioMood'],
    playerProgressRef?: React.MutableRefObject<number>,
    collectedIndices?: Set<number>,
    isPaused?: boolean,
    playerCarNeon: string
}) => {
    return (
        <>
            <DynamicSky topColor={currentThemeColors.sky} bottomColor={currentThemeColors.fog} progressRef={playerProgressRef} isPaused={isPaused} />
            <ReflectiveEnvironment topColor={currentThemeColors.sky} bottomColor={currentThemeColors.fog} />
            <GroundDecals trackPath={trackPath} collectedIndices={collectedIndices} isPaused={isPaused} />
            <FloatingMysteryEmojis trackPath={trackPath} collectedIndices={collectedIndices} isPaused={isPaused} />
            <DistortedBackground distort={fxParams.distort} speed={fxParams.speed} progressRef={playerProgressRef} isPaused={isPaused} />
        </>
    )
}
