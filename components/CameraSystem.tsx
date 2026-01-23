
import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface RacingCameraProps {
    targetGroupRef: React.RefObject<THREE.Group>;
    speedRef: React.MutableRefObject<number>;
    steeringRef: React.MutableRefObject<number>;
    driftRef: React.MutableRefObject<boolean>;
    nitroRef: React.MutableRefObject<boolean>;
    traumaRef: React.MutableRefObject<number>;
}

export const RacingCamera: React.FC<RacingCameraProps> = ({
    targetGroupRef,
    speedRef,
    steeringRef,
    driftRef,
    nitroRef,
    traumaRef
}) => {
    const { camera } = useThree();
    const currentPosition = useRef(new THREE.Vector3());
    const currentLookAt = useRef(new THREE.Vector3());
    const isInit = useRef(false);

    useFrame((state, delta) => {
        if (!targetGroupRef.current) return;
        
        // Clamp delta to prevent erratic behavior on lag spikes
        const dt = Math.min(delta, 0.1);

        const carPos = targetGroupRef.current.position;
        const carQuat = targetGroupRef.current.quaternion;
        
        // Define the ideal offset relative to the car
        // Positioned back and slightly above. 
        // Y=4.5 (Car is Y=2, so 2.5 units above)
        // Z=5.5 (Distance behind)
        const idealOffset = new THREE.Vector3(0, 4.5, 5.5);
        idealOffset.applyQuaternion(carQuat);
        idealOffset.add(carPos);

        // Define the ideal look-at point
        // Look ahead.
        // Y=3.0 (Targeting 1 unit above car roof).
        // Since Camera Y=4.5 and LookAt Y=3.0, the camera tilts slightly down (-1.5 units over ~25 units).
        // This keeps the horizon visible but places the car (Y=2.0) well into the lower third of the screen.
        const idealLookAt = new THREE.Vector3(0, 3.0, -20.0);
        idealLookAt.applyQuaternion(carQuat);
        idealLookAt.add(carPos);

        if (!isInit.current) {
            currentPosition.current.copy(idealOffset);
            currentLookAt.current.copy(idealLookAt);
            camera.position.copy(idealOffset);
            camera.lookAt(idealLookAt);
            isInit.current = true;
            return;
        }

        // --- SPRING ARM LOGIC ---
        // Significantly increased stiffness (30.0 / 20.0) to reduce "swaying" or "deviating" sensation during turns.
        // The camera now tracks the car's rotation much tighter, so the car rotates around its center on screen.
        const posLerpFactor = 30.0 * dt;
        currentPosition.current.lerp(idealOffset, posLerpFactor);

        const lookLerpFactor = 20.0 * dt;
        currentLookAt.current.lerp(idealLookAt, lookLerpFactor);

        // Apply Speed Shake / Trauma
        const trauma = traumaRef.current;
        if (trauma > 0) {
            const t = state.clock.elapsedTime * 50;
            const shakeMag = trauma * 0.25;
            currentPosition.current.add(new THREE.Vector3(
                (Math.random() - 0.5) * shakeMag,
                (Math.random() - 0.5) * shakeMag,
                (Math.random() - 0.5) * shakeMag
            ));
        }

        // Apply Position
        camera.position.copy(currentPosition.current);
        camera.lookAt(currentLookAt.current);

        // --- DYNAMIC FOV ---
        if (camera instanceof THREE.PerspectiveCamera) {
            const speed = speedRef.current;
            const baseFOV = 90; // Wide base FOV
            const targetFOV = baseFOV + (speed * 0.12) + (nitroRef.current ? 10 : 0);
            
            // Asymmetric Lerp for Zoom Effect
            // When accelerating (target > current), we zoom out relatively quickly (factor 2.0).
            // When decelerating (target < current), we reduce zoom-in drastically (factor 0.3) to prevent the "snap back" effect.
            const lerpSpeed = targetFOV > camera.fov ? dt * 3.0 : dt * 0.3;

            camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, lerpSpeed);
            camera.updateProjectionMatrix();
        }
    });

    return null;
};
