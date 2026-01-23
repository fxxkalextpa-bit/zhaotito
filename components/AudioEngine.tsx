
import React, { useImperativeHandle, forwardRef, useEffect, useRef } from 'react';

export interface AudioEngineHandle {
    playSfx: (type: 'click' | 'hover' | 'error') => void;
    resume: () => void;
}

interface AudioEngineProps {
    isPlaying: boolean;
    mode: 'menu' | 'race';
    musicMuted: boolean;
    sfxMuted: boolean;
    paused: boolean;
    onBarChange?: (bar: number) => void;
}

// D Dorian Scale: D, E, F, G, A, B, C
// Frequencies adjusted for just intonation feel
const SCALE = {
    BassD: 36.71, BassF: 43.65, BassG: 49.00, BassA: 55.00, BassC: 65.41,
    D2: 73.42, F2: 87.31, G2: 98.00, A2: 110.00, C3: 130.81,
    D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94, C4: 261.63,
    D4: 293.66, E4: 329.63, F4: 349.23, A4: 440.00, C5: 523.25, E5: 659.25
};

const AudioEngine = forwardRef<AudioEngineHandle, AudioEngineProps>(({ isPlaying, mode, musicMuted, sfxMuted, paused, onBarChange }, ref) => {
    const ctxRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const musicGainRef = useRef<GainNode | null>(null);
    const sfxGainRef = useRef<GainNode | null>(null);
    
    // Sequencer State
    const nextNoteTimeRef = useRef(0);
    const currentStepRef = useRef(0);
    const currentBarRef = useRef(0);
    const isPlayingRef = useRef(false);
    const timerIDRef = useRef<number | null>(null);

    // --- IDM SEQUENCER LOGIC ---
    // 16th notes. 1 = Trigger. 
    // Patterns are procedurally mutated in scheduleNote
    
    useEffect(() => {
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        if (AudioContextClass) {
            const ctx = new AudioContextClass();
            ctxRef.current = ctx;
            
            const master = ctx.createGain();
            // Compressor to glue the mix
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = -10;
            compressor.knee.value = 40;
            compressor.ratio.value = 12;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;

            master.connect(compressor);
            compressor.connect(ctx.destination);
            masterGainRef.current = master;

            const music = ctx.createGain();
            music.connect(master);
            musicGainRef.current = music;

            const sfx = ctx.createGain();
            sfx.connect(master);
            sfxGainRef.current = sfx;
        }
        return () => {
            if (timerIDRef.current) window.clearTimeout(timerIDRef.current);
            ctxRef.current?.close();
        };
    }, []);

    useEffect(() => {
        if (!musicGainRef.current || !sfxGainRef.current) return;
        const now = ctxRef.current?.currentTime || 0;
        
        // Smooth ducking
        musicGainRef.current.gain.setTargetAtTime(musicMuted || paused || mode === 'menu' ? 0 : 0.5, now, 0.1);
        sfxGainRef.current.gain.setTargetAtTime(sfxMuted || paused ? 0 : 0.7, now, 0.1);

        if (mode === 'race' && !paused && !isPlayingRef.current) {
            isPlayingRef.current = true;
            if (ctxRef.current?.state === 'suspended') ctxRef.current.resume();
            nextNoteTimeRef.current = ctxRef.current?.currentTime || 0 + 0.1;
            scheduler();
        } else if ((mode === 'menu' || paused) && isPlayingRef.current) {
            isPlayingRef.current = false;
            if (timerIDRef.current) window.clearTimeout(timerIDRef.current);
        }
    }, [musicMuted, sfxMuted, paused, mode]);

    // --- SYNTHESIS METHODS ---

    const playKick = (time: number, isHard: boolean) => {
        const ctx = ctxRef.current; if(!ctx || !musicGainRef.current) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(musicGainRef.current);

        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + (isHard ? 0.4 : 0.2));
        
        gain.gain.setValueAtTime(isHard ? 1.0 : 0.7, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + (isHard ? 0.4 : 0.2));

        osc.start(time);
        osc.stop(time + 0.4);
    };

    const playSnare = (time: number, isGlitch: boolean) => {
        const ctx = ctxRef.current; if(!ctx || !musicGainRef.current) return;
        
        // Tone
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const oscGain = ctx.createGain();
        osc.connect(oscGain);
        oscGain.connect(musicGainRef.current);
        osc.frequency.setValueAtTime(250, time);
        oscGain.gain.setValueAtTime(0.5, time);
        oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        osc.start(time);
        osc.stop(time + 0.1);

        // Noise
        const noiseSize = ctx.sampleRate * (isGlitch ? 0.05 : 0.2);
        const buffer = ctx.createBuffer(1, noiseSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < noiseSize; i++) data[i] = Math.random() * 2 - 1;
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;
        
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(musicGainRef.current);
        
        noiseGain.gain.setValueAtTime(isGlitch ? 0.3 : 0.6, time);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, time + (isGlitch ? 0.05 : 0.2));
        
        noise.start(time);
    };

    const playHat = (time: number, isOpen: boolean) => {
        const ctx = ctxRef.current; if(!ctx || !musicGainRef.current) return;
        
        // FM Metallic Hat
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(filter);
        filter.connect(gain);
        gain.connect(musicGainRef.current);

        carrier.type = 'square';
        modulator.type = 'sawtooth';
        
        carrier.frequency.setValueAtTime(800, time);
        modulator.frequency.setValueAtTime(1200, time);
        modGain.gain.setValueAtTime(4000, time);

        filter.type = 'highpass';
        filter.frequency.value = 5000;

        gain.gain.setValueAtTime(0.15, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + (isOpen ? 0.1 : 0.04));

        carrier.start(time);
        modulator.start(time);
        carrier.stop(time + 0.15);
        modulator.stop(time + 0.15);
    };

    const playBass = (time: number, freq: number, duration: number) => {
        const ctx = ctxRef.current; if(!ctx || !musicGainRef.current) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = 'sawtooth';
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(musicGainRef.current);

        osc.frequency.setValueAtTime(freq, time);
        
        // Lowpass sweep
        filter.type = 'lowpass';
        filter.Q.value = 5;
        filter.frequency.setValueAtTime(100, time);
        filter.frequency.exponentialRampToValueAtTime(1500, time + 0.05);
        filter.frequency.exponentialRampToValueAtTime(100, time + duration);

        gain.gain.setValueAtTime(0.5, time);
        gain.gain.linearRampToValueAtTime(0.4, time + duration * 0.8);
        gain.gain.linearRampToValueAtTime(0, time + duration);

        osc.start(time);
        osc.stop(time + duration + 0.1);
    };

    const playArp = (time: number, freq: number) => {
        const ctx = ctxRef.current; if(!ctx || !musicGainRef.current) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(musicGainRef.current);
        
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        
        osc.start(time);
        osc.stop(time + 0.2);
    };

    const playGlitch = (time: number) => {
        const ctx = ctxRef.current; if(!ctx || !musicGainRef.current) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(musicGainRef.current);
        
        osc.type = 'sawtooth';
        // Random pitch jump
        osc.frequency.setValueAtTime(Math.random() * 2000 + 200, time);
        osc.frequency.linearRampToValueAtTime(Math.random() * 100, time + 0.05);
        
        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
        
        osc.start(time);
        osc.stop(time + 0.05);
    }

    // --- SEQUENCER SCHEDULING ---

    const scheduler = () => {
        const tempo = 155; // High energy
        const secondsPerBeat = 60.0 / tempo;
        const secondsPerStep = secondsPerBeat / 4; // 16th notes
        const lookahead = 25.0;

        while (nextNoteTimeRef.current < (ctxRef.current?.currentTime || 0) + 0.1) {
            scheduleNote(currentStepRef.current, nextNoteTimeRef.current, secondsPerStep);
            nextNoteTimeRef.current += secondsPerStep;
            currentStepRef.current++;
            if (currentStepRef.current === 16) {
                currentStepRef.current = 0;
                currentBarRef.current++;
                if (onBarChange) onBarChange(currentBarRef.current);
            }
        }
        timerIDRef.current = window.setTimeout(scheduler, lookahead);
    };

    const scheduleNote = (step: number, time: number, stepDuration: number) => {
        const bar = currentBarRef.current;
        const isFillBar = bar % 8 === 7;
        const isBreak = bar % 16 === 15;

        // 1. Kick (Syncopated)
        // Standard IDM kick pattern: 1, 4, 7, 11 (approx)
        const kickPattern = isFillBar 
            ? [1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1] // Dense fill
            : [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]; // Sparse driving
        
        if (kickPattern[step] && !isBreak) playKick(time, step === 0);

        // 2. Snare / Clap
        // On 5 and 13 usually, but let's offset for IDM feel -> 5 and 14
        if ((step === 4 || step === 12) && !isBreak) {
            playSnare(time, false);
        }
        // Ghost snares
        if (Math.random() > 0.9) playSnare(time, true);

        // 3. Hi-Hats (Euclidean / Randomized)
        if (step % 2 === 0 || Math.random() > 0.7) {
            playHat(time, step % 4 === 2);
        }
        // Ratcheting hats
        if (Math.random() > 0.95) {
            playHat(time + stepDuration * 0.33, false);
            playHat(time + stepDuration * 0.66, false);
        }

        // 4. Bass (D Dorian Root Movement)
        const bassNote = bar % 4 === 0 ? SCALE.BassD : 
                         bar % 4 === 1 ? SCALE.BassF :
                         bar % 4 === 2 ? SCALE.BassG : SCALE.BassC;
        
        // Syncopated Bass line
        if ((step === 0 || step === 3 || step === 10) && !isBreak) {
            playBass(time, bassNote, stepDuration);
        }
        if (step === 14 && !isBreak) playBass(time, bassNote * 2, stepDuration); // Octave jump

        // 5. Arp / Glitch Melody
        // Fast random notes from scale
        if (!isBreak) {
            const scaleNotes = [SCALE.D3, SCALE.F3, SCALE.G3, SCALE.A3, SCALE.C4, SCALE.D4, SCALE.E4, SCALE.F4];
            // Play on random 16ths
            if (Math.random() > 0.6) {
                const note = scaleNotes[Math.floor(Math.random() * scaleNotes.length)];
                playArp(time, note);
            }
        }

        // 6. Glitch FX
        if (isFillBar || Math.random() > 0.92) {
            playGlitch(time);
        }
    };

    useImperativeHandle(ref, () => ({
        playSfx: (type) => {
            if (!ctxRef.current || sfxMuted) return;
            const t = ctxRef.current.currentTime;
            const osc = ctxRef.current.createOscillator();
            const gain = ctxRef.current.createGain();
            osc.connect(gain);
            gain.connect(sfxGainRef.current!);

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.1);
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
                osc.start(t);
                osc.stop(t + 0.1);
            }
        },
        resume: () => {
            if (ctxRef.current && ctxRef.current.state === 'suspended') {
                ctxRef.current.resume();
            }
        }
    }));

    return null;
});

export default AudioEngine;
