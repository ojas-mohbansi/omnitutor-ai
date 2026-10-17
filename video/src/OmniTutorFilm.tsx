import React from 'react';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { BackgroundMusic } from './components/BackgroundMusic';
import { Scene1Opening } from './scenes/Scene1Opening';
import { Scene2Interface } from './scenes/Scene2Interface';
import { Scene3ApiBoundary } from './scenes/Scene3ApiBoundary';
import { Scene4CorePipeline } from './scenes/Scene4CorePipeline';
import { Scene5IntelligencePipeline } from './scenes/Scene5IntelligencePipeline';
import { Scene6SafetyGrounding } from './scenes/Scene6SafetyGrounding';
import { Scene7ResponseJourney } from './scenes/Scene7ResponseJourney';
import { Scene8Architecture } from './scenes/Scene8Architecture';
import { SCENE_DURATIONS, TRANSITION_FRAMES } from './constants';

export const OmniTutorFilm: React.FC = () => {
  const { fps } = useVideoConfig();
  const T = TRANSITION_FRAMES;

  return (
    <AbsoluteFill>
      <BackgroundMusic useMp3={false} />
      <TransitionSeries>
      <TransitionSeries.Sequence name="Opening" durationInFrames={SCENE_DURATIONS.scene1} premountFor={fps}>
        <Scene1Opening />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence name="Interface" durationInFrames={SCENE_DURATIONS.scene2} premountFor={fps}>
        <Scene2Interface />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence name="API Boundary" durationInFrames={SCENE_DURATIONS.scene3} premountFor={fps}>
        <Scene3ApiBoundary />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence name="Core Pipeline" durationInFrames={SCENE_DURATIONS.scene4} premountFor={fps}>
        <Scene4CorePipeline />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence name="Intelligence Pipeline" durationInFrames={SCENE_DURATIONS.scene5} premountFor={fps}>
        <Scene5IntelligencePipeline />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence name="Safety & Grounding" durationInFrames={SCENE_DURATIONS.scene6} premountFor={fps}>
        <Scene6SafetyGrounding />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence name="Response Journey" durationInFrames={SCENE_DURATIONS.scene7} premountFor={fps}>
        <Scene7ResponseJourney />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence name="Full Architecture" durationInFrames={SCENE_DURATIONS.scene8} premountFor={fps}>
        <Scene8Architecture />
      </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
