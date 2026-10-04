(function (global) {
  'use strict';

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const average = (arr) => arr.reduce((sum, v) => sum + v, 0) / Math.max(1, arr.length);

  /**
   * AdaptivePresetBlender
   *
   * - no fixed 3s transition time
   * - dynamic blend duration based on audio signal
   * - buffered analysis window to predict transition timing
   * - cross-deformation of both presets during blend
   * - smooth, synchronised, non-abrupt visual transitions
   */
  class AdaptivePresetBlender {
    constructor(visualizer, options = {}) {
      if (!visualizer || typeof visualizer.loadPreset !== 'function') {
        throw new Error('AdaptivePresetBlender requires a Butterchurn visualizer instance.');
      }

      this.viz = visualizer;
      this.options = Object.assign({
        historySize: 12,
        minBlendDuration: 450,
        maxBlendDuration: 2800,
        defaultBlendDuration: 1400,
        audioResponse: 0.65,
        mutualInfluenceStrength: 0.42,
        deformationBias: 0.5,
        easing: 'smoothstep'
      }, options);

      this.buffer = [];
      this.state = {
        active: false,
        startTime: 0,
        blendDuration: this.options.defaultBlendDuration,
        progress: 0,
        mix: 0,
        transitionWindow: null,
        deformed: { x: 0, y: 0, scale: 1, rotation: 0 },
        audioInfluence: 0,
        isReady: false
      };

      this._presetA = null;
      this._presetB = null;
      this._transitionInitiated = false;
      this._lastAudioSample = null;
      this._activeBlend = 0;
    }

    pushAudioSample(audioState) {
      if (!audioState) return;

      const sample = {
        t: performance.now(),
        energy: clamp(audioState.energy || 0, 0, 1),
        flux: clamp(audioState.flux || 0, 0, 1),
        bass: clamp(audioState.bass || 0, 0, 1),
        mid: clamp(audioState.mid || 0, 0, 1),
        treble: clamp(audioState.treble || 0, 0, 1),
        beat: clamp(audioState.beat || 0, 0, 1),
        brightness: clamp(audioState.brightness || 0, 0, 1),
        centroid: clamp(audioState.centroid || 0, 0, 1)
      };

      this.buffer.push(sample);
      while (this.buffer.length > this.options.historySize) {
        this.buffer.shift();
      }

      this._lastAudioSample = sample;
    }

    _analyzeWindow() {
      if (!this.buffer.length) {
        return {
          energy: 0,
          flux: 0,
          bass: 0,
          mid: 0,
          treble: 0,
          beat: 0,
          brightness: 0,
          centroid: 0,
          smoothness: 0.5
        };
      }

      const energies = this.buffer.map(v => v.energy);
      const fluxes = this.buffer.map(v => v.flux);
      const basses = this.buffer.map(v => v.bass);
      const mids = this.buffer.map(v => v.mid);
      const treble = this.buffer.map(v => v.treble);
      const beats = this.buffer.map(v => v.beat);
      const brightness = this.buffer.map(v => v.brightness);
      const centroid = this.buffer.map(v => v.centroid);

      const energy = average(energies);
      const flux = average(fluxes);
      const bass = average(basses);
      const mid = average(mids);
      const trebleAvg = average(treble);
      const beat = average(beats);
      const bright = average(brightness);
      const cent = average(centroid);

      const smoothness = 1 - clamp(flux * 1.5 + beat * 0.35, 0, 1);

      return {
        energy,
        flux,
        bass,
        mid,
        treble: trebleAvg,
        beat,
        brightness: bright,
        centroid: cent,
        smoothness
      };
    }

    _computeBlendDuration(audioWindow) {
      let duration = this.options.defaultBlendDuration;
      const energy = audioWindow.energy || 0;
      const flux = audioWindow.flux || 0;
      const bass = audioWindow.bass || 0;
      const beat = audioWindow.beat || 0;
      const smoothness = audioWindow.smoothness || 0.5;

      if (energy > 0.75 && beat > 0.38) {
        duration = 600 + (1 - energy) * 350;
      } else if (energy < 0.28 && smoothness > 0.72) {
        duration = 1800 + (1 - energy) * 1200;
      } else if (flux > 0.52) {
        duration = 900;
      } else if (energy > 0.55) {
        duration = 1000;
      }

      if (bass > 0.68) duration *= 0.78;
      if (flux > 0.7) duration *= 0.8;

      return clamp(duration, this.options.minBlendDuration, this.options.maxBlendDuration);
    }

    _getEasing(t) {
      if (this.options.easing === 'cubic') return easeOutCubic(t);
      if (this.options.easing === 'linear') return t;
      return smoothstep(t);
    }

    /**
     * Trigger a transition between preset A and preset B based on current audio signal.
     * If no audio window is available, fallback to default duration.
     */
    startTransition(presetA, presetB, audioWindow = null) {
      if (!presetA || !presetB) {
        throw new Error('Both presets are required to start a transition.');
      }

      this._presetA = presetA;
      this._presetB = presetB;
      this._transitionInitiated = false;
      this.state.active = true;
      this.state.progress = 0;
      this.state.mix = 0;
      this.state.audioInfluence = 0;
      this.state.deformed.x = 0;
      this.state.deformed.y = 0;
      this.state.deformed.scale = 1;
      this.state.deformed.rotation = 0;

      const windowData = audioWindow || this._analyzeWindow();
      this.state.blendDuration = this._computeBlendDuration(windowData);
      this.state.startTime = performance.now();
      this.state.transitionWindow = windowData;

      try {
        this.viz.loadPreset(presetA, 0.0);
      } catch (e) {
        console.error('Failed to load presetA during transition start:', e);
      }

      return this;
    }

    /**
     * Call this every frame. It evaluates elapsed time and audio to create a dynamic blend.
     */
    update(audioState = null, now = performance.now()) {
      if (audioState) this.pushAudioSample(audioState);

      const windowData = this._analyzeWindow();
      if (!this.state.active) {
        return this.state;
      }

      const elapsed = now - this.state.startTime;
      const progress = clamp(elapsed / this.state.blendDuration, 0, 1);
      const eased = this._getEasing(progress);

      this.state.progress = progress;
      this.state.mix = eased;
      this.state.audioInfluence = clamp((windowData.energy || 0) * this.options.audioResponse, 0, 1);

      // Trigger preset B around mid-transition + audio based route
      if (!this._transitionInitiated && progress > 0.5) {
        this._transitionInitiated = true;
        try {
          this.viz.loadPreset(this._presetB, 2.4);
        } catch (e) {
          console.error('Failed to load presetB during adaptive transition:', e);
        }
      }

      // Compute combined deformation from both visuals
      const midPoint = 1 - Math.abs(this.state.mix - 0.5) * 2; // strongest near center
      const influence = this.options.mutualInfluenceStrength;
      const x = ((windowData.bass || 0) * 0.5 + (windowData.flux || 0) * 0.35) * midPoint * influence;
      const y = ((windowData.mid || 0) * 0.5 + (windowData.brightness || 0) * 0.35) * midPoint * influence;
      const scale = 1 + ((windowData.energy || 0) * 0.24 + (windowData.beat || 0) * 0.12) * midPoint * influence;
      const rotation = ((windowData.treble || 0) * 18 + (windowData.centroid || 0) * 12) * midPoint * influence;

      this.state.deformed = {
        x: x * 2,
        y: y * 2,
        scale,
        rotation
      };

      if (progress >= 1) {
        this.state.active = false;
        this.state.progress = 1;
        this.state.mix = 1;
        try {
          this.viz.loadPreset(this._presetB, 1.6);
        } catch (e) {
          console.error('Failed to finalise presetB during adaptive transition:', e);
        }
      }

      return this.state;
    }

    /**
     * Exposes the blended parameters to the renderer.
     */
    getBlendState() {
      return {
        progress: this.state.progress,
        mix: this.state.mix,
        deformed: this.state.deformed,
        audioInfluence: this.state.audioInfluence,
        blendDuration: this.state.blendDuration
      };
    }
  }

  global.AdaptivePresetBlender = AdaptivePresetBlender;
})(window);

/*
  Example usage:

  const blender = new AdaptivePresetBlender(viz, {
    defaultBlendDuration: 1400,
    minBlendDuration: 450,
    maxBlendDuration: 2800,
    easing: 'smoothstep'
  });

  blender.startTransition(presetA, presetB, audioWindow);

  function loop() {
    const audioState = audioReactive ? audioReactive.update() : null;
    const blend = blender.update(audioState, performance.now());
    viz.render();
    const params = blender.getBlendState();
  }
*/
